// COPY of winlax-v2 src/lib/twofa/crypto.ts. Keep the logic byte-identical: /2fa on winlax.id.vn
// and this vault read and write the same twofa_entries rows, so any difference in the key
// derivation, AAD or validation makes one side see the other's rows as corrupted.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import type { TotpAlgorithm, VaultTotp as TotpParams } from "./types";

/**
 * Saved /2fa entries are AES-256-GCM ciphertext. Each user gets a key derived from
 * TWOFA_MASTER_KEY, and the user and row ids are authenticated with every row, so a row
 * copied to another user (or another id) fails to decrypt. Keep this file free of Next-only
 * imports: the one-off import script reuses it.
 */

/** Wide enough for every entry of the old single-owner vault, which moved here. */
export const ENTRY_LIMITS = {
  account: 200,
  name: 120,
  notes: 5_000,
  password: 4_096,
  website: 2_048,
} as const;

export type SavedEntryPayload = Readonly<{
  account?: string;
  name: string;
  notes?: string;
  password?: string;
  totp?: TotpParams;
  v: 1;
  website?: string;
}>;

export type EncryptedEntry = Readonly<{ auth_tag: string; ciphertext: string; iv: string }>;

const KEY_INFO = "winlax:2fa-entries:v1";

export class MasterKeyError extends Error {}

/** TWOFA_MASTER_KEY: 32 random bytes in base64, e.g. `openssl rand -base64 32`. */
export function readMasterKey(value = process.env.TWOFA_MASTER_KEY): Buffer {
  const key = Buffer.from(value?.trim() ?? "", "base64");
  if (key.length !== 32) throw new MasterKeyError("TWOFA_MASTER_KEY phải là 32 byte base64.");
  return key;
}

function userKey(masterKey: Buffer, userId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.from(userId, "utf8"), KEY_INFO, 32));
}

function aad(userId: string, entryId: string) {
  return Buffer.from(`${KEY_INFO}:${userId}:${entryId}`, "utf8");
}

function text(value: unknown, maximum: number, required = false): string | undefined {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error("invalid_entry");
    return undefined;
  }
  if (typeof value !== "string" || value.length > maximum) throw new Error("invalid_entry");
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error("invalid_entry");
  return trimmed || undefined;
}

function totp(value: unknown): TotpParams | undefined {
  if (value === undefined || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const algorithm = record.algorithm;
  const digits = record.digits;
  const period = record.period;
  const secret = record.secret;
  if (
    (algorithm !== "SHA1" && algorithm !== "SHA256" && algorithm !== "SHA512") ||
    (digits !== 6 && digits !== 8) ||
    typeof period !== "number" ||
    !Number.isInteger(period) ||
    period < 15 ||
    period > 120 ||
    typeof secret !== "string" ||
    !/^[A-Z2-7]{16,256}$/u.test(secret)
  ) {
    throw new Error("invalid_entry");
  }
  return { algorithm: algorithm as TotpAlgorithm, digits, period, secret };
}

/** Checks and trims an entry, from a form or from the database. Throws "invalid_entry". */
export function normalizeEntryPayload(value: unknown): SavedEntryPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_entry");
  const record = value as Record<string, unknown>;
  const payload: SavedEntryPayload = {
    account: text(record.account, ENTRY_LIMITS.account),
    name: text(record.name, ENTRY_LIMITS.name, true)!,
    notes: text(record.notes, ENTRY_LIMITS.notes),
    password: text(record.password, ENTRY_LIMITS.password),
    totp: totp(record.totp),
    v: 1,
    website: text(record.website, ENTRY_LIMITS.website),
  };
  // Drop empty keys so the stored JSON stays small.
  return Object.fromEntries(
    Object.entries(payload).filter(([, field]) => field !== undefined),
  ) as SavedEntryPayload;
}

export function encryptEntry(
  masterKey: Buffer,
  userId: string,
  entryId: string,
  payload: SavedEntryPayload,
): EncryptedEntry {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", userKey(masterKey, userId), iv);
  cipher.setAAD(aad(userId, entryId));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(normalizeEntryPayload(payload)), "utf8"),
    cipher.final(),
  ]);
  return {
    auth_tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptEntry(
  masterKey: Buffer,
  userId: string,
  entryId: string,
  encrypted: EncryptedEntry,
): SavedEntryPayload {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    userKey(masterKey, userId),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(aad(userId, entryId));
  decipher.setAuthTag(Buffer.from(encrypted.auth_tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return normalizeEntryPayload(JSON.parse(plaintext));
}
