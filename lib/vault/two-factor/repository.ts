import "server-only";

import { randomUUID } from "node:crypto";

import { createDbClient, type DbClient } from "@/lib/site/db/client";

import type { EncryptedVaultRow } from "./backup";
import { getVaultConfig, type VaultConfig } from "./config";
import { decryptEntry, encryptEntry, type SavedEntryPayload } from "./shared-crypto";
import { generateTotpWindow } from "./totp";
import type { VaultEntryView, VaultPayload, VaultPrivateDetails } from "./types";

/**
 * The vault is the owner's account of the public /2fa tool on winlax.id.vn: the same
 * twofa_entries rows, so anything added, renamed or deleted on one site shows on the other.
 * Other /2fa users are never touched: every query is scoped to the owner's user id, and their
 * rows could not be decrypted with the owner's key anyway.
 */

/** Same cap as /2fa: past it, /2fa would silently stop listing the newest rows. */
export const MAX_VAULT_ENTRIES = 1_000;

type EntryRow = Readonly<{
  auth_tag: string;
  ciphertext: string;
  created_at: string;
  id: string;
  iv: string;
}>;

const ROW_COLUMNS = "id, ciphertext, iv, auth_tag, created_at";

export class VaultLimitError extends Error {
  constructor() {
    super(`Vault chỉ chứa tối đa ${MAX_VAULT_ENTRIES} mục.`);
    this.name = "VaultLimitError";
  }
}

type Vault = Readonly<{ client: DbClient; config: VaultConfig; ownerId: string }>;

/** Finds the owner's /2fa account by ADMIN_EMAIL, creating it if they never signed in there. */
async function openVault(): Promise<Vault> {
  const config = getVaultConfig();
  const client = createDbClient(config.databaseUrl);
  // /2fa stores emails lowercased and claims a row made ahead of time on the first sign-in.
  const { data, error } = await client
    .from("twofa_users")
    .select("id")
    .eq("email", config.ownerEmail)
    .order("created_at")
    .limit(1);
  if (error) throw new Error(`Không thể đọc tài khoản /2fa: ${error.message}`);

  const found = (data as { id: string }[] | null)?.[0]?.id;
  if (found) return { client, config, ownerId: found };

  const ownerId = randomUUID();
  const { error: insertError } = await client
    .from("twofa_users")
    .insert({ email: config.ownerEmail, id: ownerId });
  if (insertError) throw new Error(`Không thể tạo tài khoản /2fa: ${insertError.message}`);
  return { client, config, ownerId };
}

function toSaved(payload: VaultPayload): SavedEntryPayload {
  return {
    account: payload.account || undefined,
    name: payload.issuer,
    notes: payload.notes,
    password: payload.password,
    totp: payload.totp,
    v: 1,
    website: payload.website,
  };
}

function decryptRow(vault: Vault, row: EntryRow): SavedEntryPayload {
  return decryptEntry(vault.config.masterKey, vault.ownerId, row.id, row);
}

async function readRow(vault: Vault, id: string): Promise<EntryRow> {
  const { data, error } = await vault.client
    .from("twofa_entries")
    .select(ROW_COLUMNS)
    .eq("id", id)
    .eq("user_id", vault.ownerId)
    .maybeSingle();
  if (error) throw new Error(`Không thể đọc tài khoản từ database: ${error.message}`);
  if (!data) throw new Error("Không tìm thấy tài khoản trong vault.");
  return data as EntryRow;
}

async function listRows(vault: Vault): Promise<EntryRow[]> {
  const { data, error } = await vault.client
    .from("twofa_entries")
    .select(ROW_COLUMNS)
    .eq("user_id", vault.ownerId)
    .order("created_at")
    .order("id")
    .limit(MAX_VAULT_ENTRIES);
  if (error) throw new Error(`Không thể đọc dữ liệu 2FA từ database: ${error.message}`);
  return (data ?? []) as EntryRow[];
}

/** For "Sao lưu": the owner's rows exactly as stored (ciphertext only). */
export async function listEncryptedVaultRows(): Promise<EncryptedVaultRow[]> {
  const vault = await openVault();
  return (await listRows(vault)).map((row) => ({ ...row, user_id: vault.ownerId }));
}

export async function listVaultEntries(): Promise<VaultEntryView[]> {
  const vault = await openVault();
  const timestamp = Date.now();
  return (await listRows(vault))
    .map((row): VaultEntryView => {
      try {
        const payload = decryptRow(vault, row);
        const window = payload.totp ? generateTotpWindow(payload.totp, timestamp) : {};
        return {
          account: payload.account ?? "",
          createdAt: row.created_at,
          hasNotes: Boolean(payload.notes),
          hasPassword: Boolean(payload.password),
          hasTotp: Boolean(payload.totp),
          id: row.id,
          isCorrupted: false,
          issuer: payload.name,
          period: payload.totp?.period,
          website: payload.website,
          ...window,
        };
      } catch {
        return {
          account: "Bản ghi có thể đã bị thay đổi hoặc dùng khóa khác.",
          createdAt: row.created_at,
          hasNotes: false,
          hasPassword: false,
          hasTotp: false,
          id: row.id,
          isCorrupted: true,
          issuer: "Không thể giải mã",
        };
      }
    })
    .toSorted((first, second) => first.issuer.localeCompare(second.issuer, "vi"));
}

export async function getVaultEntryPrivateDetails(id: string): Promise<VaultPrivateDetails> {
  const vault = await openVault();
  const payload = decryptRow(vault, await readRow(vault, id));
  return { notes: payload.notes, password: payload.password };
}

export async function insertVaultEntry(payload: VaultPayload): Promise<void> {
  await insertVaultEntries([payload]);
}

/** Throws "invalid_entry" when a payload breaks the /2fa limits, VaultLimitError past the cap. */
export async function insertVaultEntries(payloads: readonly VaultPayload[]): Promise<void> {
  if (payloads.length === 0) return;
  const vault = await openVault();

  const { count, error: countError } = await vault.client
    .from("twofa_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", vault.ownerId);
  if (countError) throw new Error(`Không thể đếm mục trong vault: ${countError.message}`);
  if ((count ?? 0) + payloads.length > MAX_VAULT_ENTRIES) throw new VaultLimitError();

  // One millisecond apart, like /2fa, so both lists keep the order they were added in.
  const base = Date.now();
  const rows = payloads.map((payload, index) => {
    const id = randomUUID();
    return {
      ...encryptEntry(vault.config.masterKey, vault.ownerId, id, toSaved(payload)),
      created_at: new Date(base + index).toISOString(),
      id,
      user_id: vault.ownerId,
    };
  });
  const { error } = await vault.client.from("twofa_entries").insert(rows);
  if (error) throw new Error(`Không thể lưu bản ghi 2FA: ${error.message}`);
}

/** New service name and account; the TOTP secret, password, notes and website stay. */
export async function renameVaultEntry(
  id: string,
  label: Readonly<{ account: string; issuer: string }>,
): Promise<void> {
  const vault = await openVault();
  const payload = decryptRow(vault, await readRow(vault, id));
  const next: SavedEntryPayload = { ...payload, account: label.account || undefined, name: label.issuer };
  const { error } = await vault.client
    .from("twofa_entries")
    .update({
      ...encryptEntry(vault.config.masterKey, vault.ownerId, id, next),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", vault.ownerId);
  if (error) throw new Error(`Không thể lưu tên mới: ${error.message}`);
}

export async function removeVaultEntry(id: string): Promise<void> {
  const vault = await openVault();
  const { error } = await vault.client
    .from("twofa_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", vault.ownerId);
  if (error) throw new Error(`Không thể xóa bản ghi 2FA: ${error.message}`);
}
