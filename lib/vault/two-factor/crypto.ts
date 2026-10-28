import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import type {
  EncryptedVaultPayload,
  TotpAlgorithm,
  VaultPayload,
  VaultTotp,
} from "./types";

const AAD = Buffer.from("winlax:two-factor:v1", "utf8");

function deriveEncryptionKey(masterKey: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.alloc(0), AAD, 32));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maximumLength
  ) {
    throw new Error(`${label} trong bản ghi vault không hợp lệ.`);
  }
  return value;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > maximumLength) {
    throw new Error(`${label} trong bản ghi vault không hợp lệ.`);
  }
  return value || undefined;
}

function normalizeTotp(value: unknown): VaultTotp {
  if (!isRecord(value)) {
    throw new Error("Cấu hình TOTP trong bản ghi vault không hợp lệ.");
  }

  const algorithm = value.algorithm;
  const digits = value.digits;
  const period = value.period;
  const secret = value.secret;
  if (
    (algorithm !== "SHA1" &&
      algorithm !== "SHA256" &&
      algorithm !== "SHA512") ||
    (digits !== 6 && digits !== 8) ||
    typeof period !== "number" ||
    !Number.isInteger(period) ||
    period < 15 ||
    period > 120 ||
    typeof secret !== "string" ||
    !/^[A-Z2-7]{16,}$/u.test(secret)
  ) {
    throw new Error("Cấu hình TOTP trong bản ghi vault không hợp lệ.");
  }

  return {
    algorithm: algorithm as TotpAlgorithm,
    digits,
    period,
    secret,
  };
}

function normalizeDecryptedPayload(value: unknown): VaultPayload {
  if (!isRecord(value)) {
    throw new Error("Bản ghi vault không hợp lệ.");
  }

  const account = requiredText(value.account, "Tài khoản", 160);
  const issuer = requiredText(value.issuer, "Dịch vụ", 80);
  const notes = optionalText(value.notes, "Ghi chú", 5_000);
  const password = optionalText(value.password, "Mật khẩu", 4_096);
  const website = optionalText(value.website, "Website", 2_048);
  const totp = value.totp
    ? normalizeTotp(value.totp)
    : value.secret
      ? normalizeTotp({
          algorithm: value.algorithm,
          digits: value.digits,
          period: value.period,
          secret: value.secret,
        })
      : undefined;

  if (!password && !notes && !totp) {
    throw new Error("Bản ghi vault không chứa thông tin riêng tư.");
  }

  return {
    account,
    issuer,
    notes,
    password,
    totp,
    version: 2,
    website,
  };
}

export function encryptVaultPayload(
  payload: VaultPayload,
  masterKey: Buffer,
): EncryptedVaultPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(masterKey),
    iv,
  );
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptVaultPayload(
  encrypted: EncryptedVaultPayload,
  masterKey: Buffer,
): VaultPayload {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(masterKey),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return normalizeDecryptedPayload(JSON.parse(plaintext) as unknown);
}

/**
 * Encrypts a vault setting (for example the unlock TOTP secret) with the master key. The
 * additional data names the setting, so a ciphertext cannot be moved to another setting or
 * passed off as a vault entry, and an entry cannot be read as a setting.
 */
export function encryptVaultSetting(
  key: string,
  value: string,
  masterKey: Buffer,
): EncryptedVaultPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(masterKey),
    iv,
  );
  cipher.setAAD(Buffer.from(`winlax:vault-setting:v1:${key}`, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptVaultSetting(
  key: string,
  encrypted: EncryptedVaultPayload,
  masterKey: Buffer,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveEncryptionKey(masterKey),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(`winlax:vault-setting:v1:${key}`, "utf8"));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
