import "server-only";

import { createDbClient } from "@/lib/vault/db/client";

import type { EncryptedVaultRow } from "./backup";
import { decryptVaultPayload, encryptVaultPayload } from "./crypto";
import { getVaultConfig } from "./config";
import { generateTotpWindow } from "./totp";
import type {
  VaultEntryView,
  VaultPayload,
  VaultPrivateDetails,
} from "./types";

type VaultRow = Readonly<{
  auth_tag: string;
  ciphertext: string;
  created_at: string;
  id: string;
  iv: string;
}>;

function createVaultClient() {
  const { databaseUrl } = getVaultConfig();
  return createDbClient(databaseUrl);
}

export async function listEncryptedVaultRows(): Promise<EncryptedVaultRow[]> {
  const { data, error } = await createVaultClient()
    .from("two_factor_entries")
    .select("id, ciphertext, iv, auth_tag, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Không thể đọc dữ liệu để sao lưu: ${error.message}`);
  }
  return (data ?? []) as EncryptedVaultRow[];
}

export async function listVaultEntries(): Promise<VaultEntryView[]> {
  const config = getVaultConfig();
  const { data, error } = await createVaultClient()
    .from("two_factor_entries")
    .select("id, ciphertext, iv, auth_tag, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Không thể đọc dữ liệu 2FA từ database: ${error.message}`);
  }

  const timestamp = Date.now();
  return ((data ?? []) as VaultRow[])
    .map((row): VaultEntryView => {
      try {
        const payload = decryptVaultPayload(
          {
            authTag: row.auth_tag,
            ciphertext: row.ciphertext,
            iv: row.iv,
          },
          config.masterKey,
        );
        const window = payload.totp
          ? generateTotpWindow(payload.totp, timestamp)
          : {};
        return {
          account: payload.account,
          createdAt: row.created_at,
          hasNotes: Boolean(payload.notes),
          hasPassword: Boolean(payload.password),
          hasTotp: Boolean(payload.totp),
          id: row.id,
          isCorrupted: false,
          issuer: payload.issuer,
          period: payload.totp?.period,
          website: payload.website,
          ...window,
        };
      } catch {
        return {
          account: "Bản ghi có thể đã bị thay đổi hoặc dùng khóa cũ.",
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
    .toSorted((first, second) =>
      first.issuer.localeCompare(second.issuer, "vi"),
    );
}

export async function getVaultEntryPrivateDetails(
  id: string,
): Promise<VaultPrivateDetails> {
  const config = getVaultConfig();
  const { data, error } = await createVaultClient()
    .from("two_factor_entries")
    .select("id, ciphertext, iv, auth_tag, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Không thể đọc tài khoản từ database: ${error.message}`);
  }
  if (!data) throw new Error("Không tìm thấy tài khoản trong vault.");

  const payload = decryptVaultPayload(
    {
      authTag: (data as VaultRow).auth_tag,
      ciphertext: (data as VaultRow).ciphertext,
      iv: (data as VaultRow).iv,
    },
    config.masterKey,
  );

  return { notes: payload.notes, password: payload.password };
}

export async function insertVaultEntry(payload: VaultPayload): Promise<void> {
  await insertVaultEntries([payload]);
}

export async function insertVaultEntries(
  payloads: readonly VaultPayload[],
): Promise<void> {
  if (payloads.length === 0) return;

  const config = getVaultConfig();
  const rows = payloads.map((payload) => {
    const encrypted = encryptVaultPayload(payload, config.masterKey);
    return {
      auth_tag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
    };
  });
  const { error } = await createVaultClient()
    .from("two_factor_entries")
    .insert(rows);

  if (error) {
    throw new Error(`Không thể lưu bản ghi 2FA: ${error.message}`);
  }
}

/** The renamed copy was saved but the old entry could not be deleted, so both are listed. */
export class VaultRenameIncompleteError extends Error {
  constructor() {
    super("Đã lưu tên mới nhưng chưa xóa được bản cũ.");
    this.name = "VaultRenameIncompleteError";
  }
}

/**
 * Gives an entry a new service name and account and keeps everything else. Entries are
 * write-once (the table grants no UPDATE), so the renamed copy is inserted before the old row
 * is deleted: a failure can leave a duplicate, never lose the entry.
 */
export async function renameVaultEntry(
  id: string,
  label: Readonly<{ account: string; issuer: string }>,
): Promise<void> {
  const config = getVaultConfig();
  const client = createVaultClient();
  const { data, error } = await client
    .from("two_factor_entries")
    .select("id, ciphertext, iv, auth_tag, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Không thể đọc tài khoản từ database: ${error.message}`);
  }
  if (!data) throw new Error("Không tìm thấy tài khoản trong vault.");

  const row = data as VaultRow;
  const payload = decryptVaultPayload(
    { authTag: row.auth_tag, ciphertext: row.ciphertext, iv: row.iv },
    config.masterKey,
  );
  const encrypted = encryptVaultPayload(
    { ...payload, account: label.account, issuer: label.issuer },
    config.masterKey,
  );
  const { error: insertError } = await client
    .from("two_factor_entries")
    .insert({
      auth_tag: encrypted.authTag,
      ciphertext: encrypted.ciphertext,
      // Keep the original date so backups stay in the order the entries were added.
      created_at: row.created_at,
      iv: encrypted.iv,
    });
  if (insertError) {
    throw new Error(`Không thể lưu tên mới: ${insertError.message}`);
  }

  const { error: deleteError } = await client
    .from("two_factor_entries")
    .delete()
    .eq("id", id);
  if (deleteError) throw new VaultRenameIncompleteError();
}

export async function removeVaultEntry(id: string): Promise<void> {
  const { error } = await createVaultClient()
    .from("two_factor_entries")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Không thể xóa bản ghi 2FA: ${error.message}`);
  }
}
