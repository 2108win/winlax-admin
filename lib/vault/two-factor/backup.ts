/**
 * The vault can be exported on demand (the server also keeps daily pg_dump backups).
 * The file contains only what the database already holds: AES-256-GCM ciphertext. It is
 * useless without TWO_FA_MASTER_KEY, which is deliberately NOT included.
 */
export const VAULT_BACKUP_FORMAT = "winlax-vault-backup";

export type EncryptedVaultRow = Readonly<{
  auth_tag: string;
  ciphertext: string;
  created_at: string;
  id: string;
  iv: string;
}>;

export type VaultBackup = Readonly<{
  content: string;
  count: number;
  filename: string;
}>;

export function createVaultBackup(
  rows: readonly EncryptedVaultRow[],
  now: Date = new Date(),
): VaultBackup {
  const content = JSON.stringify(
    {
      exportedAt: now.toISOString(),
      format: VAULT_BACKUP_FORMAT,
      rows: rows.map(({ auth_tag, ciphertext, created_at, id, iv }) => ({
        auth_tag,
        ciphertext,
        created_at,
        id,
        iv,
      })),
      table: "two_factor_entries",
      version: 1,
    },
    null,
    2,
  );

  return {
    content,
    count: rows.length,
    filename: `winlax-vault-backup-${now.toISOString().slice(0, 10)}.json`,
  };
}

/**
 * Restoring is a plain SQL insert, so no code has to be trusted at the worst moment:
 * paste the `rows` array between the quotes in psql.
 */
export const VAULT_RESTORE_SQL = `insert into public.two_factor_entries (id, ciphertext, iv, auth_tag, created_at)
select id, ciphertext, iv, auth_tag, created_at
from json_populate_recordset(null::public.two_factor_entries, '[PASTE THE rows ARRAY HERE]'::json)
on conflict (id) do nothing;`;
