import "server-only";

import { readFirstEnvironmentValue } from "@/lib/site/db/client";

import { readMasterKey } from "./shared-crypto";

export type VaultConfig = Readonly<{
  databaseUrl: string;
  masterKey: Buffer;
  ownerEmail: string;
}>;

/**
 * The vault shows the owner's /2fa account on winlax.id.vn: the rows of ADMIN_EMAIL in
 * twofa_entries (database winlax_v2), encrypted with the same TWOFA_MASTER_KEY winlax-v2 uses.
 * The admin login alone opens it.
 */
export function getVaultConfigurationErrors(): string[] {
  const errors: string[] = [];
  if (!readFirstEnvironmentValue(["VAULT_DATABASE_URL"])) errors.push("VAULT_DATABASE_URL");
  if (!readFirstEnvironmentValue(["ADMIN_EMAIL"])) errors.push("ADMIN_EMAIL");
  const masterKey = readFirstEnvironmentValue(["TWOFA_MASTER_KEY"]);
  if (!masterKey) {
    errors.push("TWOFA_MASTER_KEY (giống hệt env winlax-v2)");
  } else {
    try {
      readMasterKey(masterKey);
    } catch {
      errors.push("TWOFA_MASTER_KEY phải là khóa Base64 32 byte");
    }
  }
  return errors;
}

export function getVaultConfig(): VaultConfig {
  const errors = getVaultConfigurationErrors();
  if (errors.length > 0) throw new Error(`Vault chưa được cấu hình: ${errors.join(", ")}`);
  return {
    databaseUrl: readFirstEnvironmentValue(["VAULT_DATABASE_URL"])!,
    masterKey: readMasterKey(readFirstEnvironmentValue(["TWOFA_MASTER_KEY"])),
    ownerEmail: readFirstEnvironmentValue(["ADMIN_EMAIL"])!.toLowerCase(),
  };
}
