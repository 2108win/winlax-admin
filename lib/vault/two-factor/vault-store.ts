import "server-only";


import { createDbClient, type DbClient } from "@/lib/vault/db/client";

import { getVaultConfig } from "./config";
import { decryptVaultSetting, encryptVaultSetting } from "./crypto";

/** A vault session lasts at most this long, however active it is. */
export const VAULT_SESSION_SECONDS = 8 * 60 * 60;
/** A session with no user activity for this long is locked. */
export const VAULT_IDLE_SECONDS = 15 * 60;
/** last_seen_at is written at most this often, so activity costs one write a minute at most. */
export const VAULT_TOUCH_INTERVAL_SECONDS = 60;

const UNLOCK_TOTP_KEY = "unlock_totp";

/** A store failure. `missingTable` means the newest migration has not been run yet. */
export class VaultStoreError extends Error {
  constructor(
    message: string,
    readonly missingTable: boolean,
  ) {
    super(message);
    this.name = "VaultStoreError";
  }
}

type StoreError = Readonly<{ code?: string; message: string }>;

function storeError(
  action: string,
  error: StoreError,
  status: number,
): VaultStoreError {
  const missingTable =
    status === 404 || error.code === "PGRST205" || error.code === "42P01";
  return new VaultStoreError(`${action}: ${error.message}`, missingTable);
}

function createVaultClient(): DbClient {
  const { databaseUrl } = getVaultConfig();
  return createDbClient(databaseUrl);
}

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type VaultSessionRow = Readonly<{
  expires_at: string;
  id: string;
  last_seen_at: string;
  revoked_at: string | null;
}>;

/** Active means: not revoked, not past its absolute expiry, and used within the idle window. */
export function isVaultSessionActive(
  row: VaultSessionRow,
  now = Date.now(),
): boolean {
  return (
    row.revoked_at === null &&
    Date.parse(row.expires_at) > now &&
    Date.parse(row.last_seen_at) > now - VAULT_IDLE_SECONDS * 1000
  );
}

export async function insertVaultSession(
  actorHash: string,
  now = Date.now(),
): Promise<string> {
  const { data, error, status } = await createVaultClient()
    .from("vault_sessions")
    .insert({
      actor_hash: actorHash,
      expires_at: iso(now + VAULT_SESSION_SECONDS * 1000),
      last_seen_at: iso(now),
    })
    .select("id");
  if (error) throw storeError("Không thể tạo phiên vault", error, status);
  const id = ((data ?? []) as { id: string }[])[0]?.id;
  if (!id) throw new VaultStoreError("Không thể tạo phiên vault", false);
  return id;
}

export async function findVaultSession(
  id: string,
): Promise<VaultSessionRow | null> {
  const { data, error, status } = await createVaultClient()
    .from("vault_sessions")
    .select("id, expires_at, last_seen_at, revoked_at")
    .eq("id", id)
    .limit(1);
  if (error) throw storeError("Không thể đọc phiên vault", error, status);
  return ((data ?? []) as VaultSessionRow[])[0] ?? null;
}

/** Records user activity. The filter makes it a no-op when it ran less than a minute ago. */
export async function touchVaultSession(
  id: string,
  now = Date.now(),
): Promise<void> {
  const { error, status } = await createVaultClient()
    .from("vault_sessions")
    .update({ last_seen_at: iso(now) })
    .eq("id", id)
    .is("revoked_at", null)
    .lt("last_seen_at", iso(now - VAULT_TOUCH_INTERVAL_SECONDS * 1000));
  if (error) throw storeError("Không thể cập nhật phiên vault", error, status);
}

export async function revokeVaultSession(
  id: string,
  now = Date.now(),
): Promise<void> {
  const { error, status } = await createVaultClient()
    .from("vault_sessions")
    .update({ revoked_at: iso(now) })
    .eq("id", id)
    .is("revoked_at", null);
  if (error) throw storeError("Không thể khóa phiên vault", error, status);
}

/** Signs out every browser, or every browser but `exceptId`. */
export async function revokeAllVaultSessions(
  options: Readonly<{ exceptId?: string; now?: number }> = {},
): Promise<void> {
  let query = createVaultClient()
    .from("vault_sessions")
    .update({ revoked_at: iso(options.now ?? Date.now()) })
    .is("revoked_at", null);
  if (options.exceptId) query = query.neq("id", options.exceptId);
  const { error, status } = await query;
  if (error) throw storeError("Không thể khóa các phiên vault", error, status);
}

export async function countActiveVaultSessions(
  now = Date.now(),
): Promise<number> {
  const { count, error, status } = await createVaultClient()
    .from("vault_sessions")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null)
    .gt("expires_at", iso(now))
    .gt("last_seen_at", iso(now - VAULT_IDLE_SECONDS * 1000));
  if (error) throw storeError("Không thể đếm phiên vault", error, status);
  return count ?? 0;
}

/** Deletes session rows that expired more than `days` ago (run by the keep-alive job). */
export async function pruneVaultSessions(
  days: number,
  client: DbClient = createDbClient(),
  now = Date.now(),
): Promise<void> {
  const { error, status } = await client
    .from("vault_sessions")
    .delete()
    .lt("expires_at", iso(now - days * 24 * 60 * 60 * 1000));
  if (error) throw storeError("Không thể dọn phiên vault cũ", error, status);
}

// ---------------------------------------------------------------------------
// Unlock TOTP setting
// ---------------------------------------------------------------------------

export type UnlockTotpSetting =
  | Readonly<{ enabled: false }>
  | Readonly<{ enabled: true; lastStep: number; secret: string }>;

type SettingRow = Readonly<{
  auth_tag: string;
  ciphertext: string;
  iv: string;
  last_step: number | string;
}>;

export async function readUnlockTotp(): Promise<UnlockTotpSetting> {
  const { data, error, status } = await createVaultClient()
    .from("vault_settings")
    .select("ciphertext, iv, auth_tag, last_step")
    .eq("key", UNLOCK_TOTP_KEY)
    .limit(1);
  if (error) throw storeError("Không thể đọc cài đặt vault", error, status);

  const row = ((data ?? []) as SettingRow[])[0];
  if (!row) return { enabled: false };

  const secret = decryptVaultSetting(
    UNLOCK_TOTP_KEY,
    { authTag: row.auth_tag, ciphertext: row.ciphertext, iv: row.iv },
    getVaultConfig().masterKey,
  );
  return { enabled: true, lastStep: Number(row.last_step), secret };
}

/** Turns the unlock code on. `acceptedStep` is the step just used to confirm it. */
export async function saveUnlockTotp(
  secret: string,
  acceptedStep: number,
): Promise<void> {
  const encrypted = encryptVaultSetting(
    UNLOCK_TOTP_KEY,
    secret,
    getVaultConfig().masterKey,
  );
  const { error, status } = await createVaultClient()
    .from("vault_settings")
    .insert({
      auth_tag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      key: UNLOCK_TOTP_KEY,
      last_step: acceptedStep,
    });
  if (error) throw storeError("Không thể lưu mã xác minh", error, status);
}

/**
 * Accepts a TOTP step once. The update only matches while the stored step is older, so two
 * requests racing with the same code cannot both succeed.
 */
export async function consumeUnlockTotpStep(step: number): Promise<boolean> {
  const { data, error, status } = await createVaultClient()
    .from("vault_settings")
    .update({ last_step: step, updated_at: iso(Date.now()) })
    .eq("key", UNLOCK_TOTP_KEY)
    .lt("last_step", step)
    .select("key");
  if (error) throw storeError("Không thể xác nhận mã xác minh", error, status);
  return (data ?? []).length === 1;
}

export async function deleteUnlockTotp(): Promise<void> {
  const { error, status } = await createVaultClient()
    .from("vault_settings")
    .delete()
    .eq("key", UNLOCK_TOTP_KEY);
  if (error) throw storeError("Không thể tắt mã xác minh", error, status);
}
