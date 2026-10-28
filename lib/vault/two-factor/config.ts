import "server-only";

import { readFirstEnvironmentValue } from "@/lib/vault/db/client";

export type VaultConfig = Readonly<{
  masterKey: Buffer;
  databaseUrl: string;
}>;

function decodeMasterKey(value: string | undefined): Buffer | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * The vault is opened by the admin login alone; it only needs the database and the key that
 * encrypts the entries (the same TWO_FA_MASTER_KEY winlax-v2 used; changing it loses every entry).
 */
export function getVaultConfigurationErrors(): string[] {
  const errors: string[] = [];
  const masterKey = readFirstEnvironmentValue(["TWO_FA_MASTER_KEY"]);

  if (!readFirstEnvironmentValue(["VAULT_DATABASE_URL"])) {
    errors.push("VAULT_DATABASE_URL");
  }
  if (!masterKey) {
    errors.push("TWO_FA_MASTER_KEY");
  } else if (!decodeMasterKey(masterKey)) {
    errors.push("TWO_FA_MASTER_KEY phải là khóa Base64 32 byte");
  }

  return errors;
}

export function getVaultConfig(): VaultConfig {
  const errors = getVaultConfigurationErrors();
  if (errors.length > 0) {
    throw new Error(`Vault chưa được cấu hình: ${errors.join(", ")}`);
  }

  return {
    masterKey: decodeMasterKey(process.env.TWO_FA_MASTER_KEY?.trim())!,
    databaseUrl: readFirstEnvironmentValue(["VAULT_DATABASE_URL"])!,
  };
}
