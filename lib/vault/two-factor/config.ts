import "server-only";

import {
  readFirstEnvironmentValue,
} from "@/lib/vault/db/client";


export type VaultConfig = Readonly<{
  masterKey: Buffer;
  password: string;
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

export function getVaultConfigurationErrors(): string[] {
  const errors: string[] = [];
  const password = readFirstEnvironmentValue(["TWO_FA_VAULT_PASSWORD"]);
  const masterKey = readFirstEnvironmentValue(["TWO_FA_MASTER_KEY"]);

  if (!readFirstEnvironmentValue(["VAULT_DATABASE_URL"])) {
    errors.push("VAULT_DATABASE_URL");
  }
  if (!password) {
    errors.push("TWO_FA_VAULT_PASSWORD");
  }
  if (!masterKey) {
    errors.push("TWO_FA_MASTER_KEY");
  } else if (!decodeMasterKey(masterKey)) {
    errors.push("TWO_FA_MASTER_KEY phải là khóa Base64 32 byte");
  }

  return errors;
}

/** Below this the owner is warned (not blocked) to turn on the unlock code. */
export const RECOMMENDED_VAULT_PASSWORD_LENGTH = 12;

export function isShortVaultPassword(): boolean {
  const password = readFirstEnvironmentValue(["TWO_FA_VAULT_PASSWORD"]) ?? "";
  return password.length < RECOMMENDED_VAULT_PASSWORD_LENGTH;
}

export function getVaultConfig(): VaultConfig {
  const errors = getVaultConfigurationErrors();
  if (errors.length > 0) {
    throw new Error(`2FA vault chưa được cấu hình: ${errors.join(", ")}`);
  }

  return {
    masterKey: decodeMasterKey(process.env.TWO_FA_MASTER_KEY?.trim())!,
    password: process.env.TWO_FA_VAULT_PASSWORD!.trim(),
    databaseUrl: readFirstEnvironmentValue(["VAULT_DATABASE_URL"])!,
  };
}
