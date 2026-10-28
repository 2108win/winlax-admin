import type { VaultImportInput } from "./types";

/**
 * Google Authenticator's "Transfer accounts" QR: otpauth-migration://offline?data=<protobuf>.
 * Runs in the browser, so the secrets stay there until the owner confirms the import. Each
 * account becomes a standard otpauth://totp URI that the server validates like any other.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MAX_MIGRATION_SOURCE_LENGTH = 16_000;
const MALFORMED = "QR chuyển tài khoản bị hỏng hoặc chụp chưa đủ rõ.";
// Protobuf enum: 0 = unspecified (SHA-1), 1 SHA-1, 2 SHA-256, 3 SHA-512, 4 MD5 (unsupported).
const ALGORITHMS = ["SHA1", "SHA1", "SHA256", "SHA512"] as const;

/** Short names people type into an authenticator label, mapped to the service's name. */
const KNOWN_SERVICES: Readonly<Record<string, string>> = {
  amazon: "Amazon",
  apple: "Apple",
  aws: "Amazon Web Services",
  binance: "Binance",
  discord: "Discord",
  dropbox: "Dropbox",
  epic: "Epic Games",
  "epic games": "Epic Games",
  facebook: "Facebook",
  fb: "Facebook",
  github: "GitHub",
  gitlab: "GitLab",
  gmail: "Google",
  google: "Google",
  ig: "Instagram",
  instagram: "Instagram",
  microsoft: "Microsoft",
  okx: "OKX",
  outlook: "Microsoft",
  paypal: "PayPal",
  reddit: "Reddit",
  riot: "Riot Games",
  "riot games": "Riot Games",
  shopee: "Shopee",
  steam: "Steam",
  teamviewer: "TeamViewer",
  telegram: "Telegram",
  threads: "Threads",
  tiktok: "TikTok",
  twitch: "Twitch",
  twitter: "X",
  vercel: "Vercel",
  zalo: "Zalo",
};

export type MigrationAccount = Readonly<{
  /** Set when this account cannot be imported (HOTP, MD5…). */
  error?: string;
  /** The service name was worked out from the label rather than given. */
  guessed: boolean;
  input?: VaultImportInput;
  /** The name as the authenticator showed it. */
  label: string;
}>;

export type MigrationBatch = Readonly<{
  accounts: MigrationAccount[];
  batchId: number;
  /** 0-based position of this QR when the export is split over several. */
  batchIndex: number;
  batchSize: number;
}>;

type ProtoField = Readonly<{ number: number; value: number | Uint8Array }>;

function readFields(bytes: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;

  const readVarint = () => {
    let result = 0;
    let multiplier = 1;
    for (let index = 0; index < 10; index += 1) {
      if (offset >= bytes.length) throw new Error(MALFORMED);
      const byte = bytes[offset++];
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) return result;
      multiplier *= 128;
    }
    throw new Error(MALFORMED);
  };

  while (offset < bytes.length) {
    const key = readVarint();
    const number = Math.floor(key / 8);
    const wireType = key % 8;
    if (wireType === 0) {
      fields.push({ number, value: readVarint() });
    } else if (wireType === 2) {
      const length = readVarint();
      if (offset + length > bytes.length) throw new Error(MALFORMED);
      fields.push({ number, value: bytes.subarray(offset, offset + length) });
      offset += length;
    } else if (wireType === 1 || wireType === 5) {
      offset += wireType === 1 ? 8 : 4;
    } else {
      throw new Error(MALFORMED);
    }
  }
  if (offset > bytes.length) throw new Error(MALFORMED);
  return fields;
}

function decodeBase64(value: string): Uint8Array {
  // URLSearchParams turns "+" into a space; URL-safe exports use "-" and "_".
  const normalized = value
    .trim()
    .replace(/ /gu, "+")
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .replace(/=+$/u, "");
  let binary: string;
  try {
    binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  } catch {
    throw new Error(MALFORMED);
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase32(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function asText(value: number | Uint8Array | undefined): string {
  return value instanceof Uint8Array
    ? new TextDecoder().decode(value).trim()
    : "";
}

function asNumber(value: number | Uint8Array | undefined): number {
  return typeof value === "number" ? value : 0;
}

/** The service's usual name for a short label such as "ig" or "tiktok". */
export function suggestServiceName(value: string): string | undefined {
  return KNOWN_SERVICES[value.trim().toLowerCase().replace(/\s+/gu, " ")];
}

/**
 * Splits an authenticator label into service and account. "ig: me" gives Instagram / me;
 * a bare "tiktok" gives TikTok and keeps the label as the account so it can still be saved.
 */
export function splitAuthenticatorLabel(
  issuer: string,
  name: string,
): Readonly<{ account: string; guessed: boolean; issuer: string }> {
  let account = name.trim();
  const service = issuer.trim();
  const separator = account.indexOf(":");
  if (separator > 0) {
    const prefix = account.slice(0, separator).trim();
    if (!service || prefix.toLowerCase() === service.toLowerCase()) {
      account = account.slice(separator + 1).trim();
      if (!service) {
        const known = suggestServiceName(prefix);
        return { account, guessed: Boolean(known), issuer: known ?? prefix };
      }
    }
  }
  if (!service) {
    const known = suggestServiceName(account);
    if (known) return { account, guessed: true, issuer: known };
  }
  return { account, guessed: false, issuer: service };
}

export function isMigrationSource(source: string): boolean {
  return source.trim().toLowerCase().startsWith("otpauth-migration://");
}

/** Reads every account in one Google Authenticator transfer QR. */
export function expandMigrationSource(source: string): MigrationBatch {
  const trimmed = source.trim();
  if (trimmed.length > MAX_MIGRATION_SOURCE_LENGTH) {
    throw new Error("QR chuyển tài khoản vượt quá giới hạn cho phép.");
  }

  let data: string | null;
  try {
    data = new URL(trimmed).searchParams.get("data");
  } catch {
    throw new Error(MALFORMED);
  }
  if (!data) throw new Error(MALFORMED);

  const fields = readFields(decodeBase64(data));
  const header = (fieldNumber: number) =>
    asNumber(fields.find((field) => field.number === fieldNumber)?.value);

  const accounts = fields
    .filter(
      (field): field is ProtoField & { value: Uint8Array } =>
        field.number === 1 && field.value instanceof Uint8Array,
    )
    .map((field): MigrationAccount => {
      const otp = new Map(
        readFields(field.value).map((entry) => [entry.number, entry.value]),
      );
      const secret = otp.get(1);
      const name = asText(otp.get(2));
      const { account, guessed, issuer } = splitAuthenticatorLabel(
        asText(otp.get(3)),
        name,
      );
      const label = [asText(otp.get(3)), name].filter(Boolean).join(" · ");
      const algorithm = ALGORITHMS[asNumber(otp.get(4))];
      const type = asNumber(otp.get(6));

      if (type === 1) {
        return {
          error: "Mã HOTP (theo bộ đếm) chưa được vault hỗ trợ.",
          guessed,
          label,
        };
      }
      if (!algorithm) {
        return {
          error: "Thuật toán của mã này chưa được hỗ trợ.",
          guessed,
          label,
        };
      }
      if (!(secret instanceof Uint8Array) || secret.length === 0) {
        return { error: "Tài khoản này không có secret.", guessed, label };
      }

      const parameters = new URLSearchParams({
        algorithm,
        digits: asNumber(otp.get(5)) === 2 ? "8" : "6",
        period: "30",
        secret: encodeBase32(secret),
      });
      return {
        guessed,
        input: { account, issuer, source: `otpauth://totp/?${parameters}` },
        label,
      };
    });

  if (accounts.length === 0) {
    throw new Error("QR chuyển tài khoản không chứa tài khoản nào.");
  }

  return {
    accounts,
    batchId: header(5),
    batchIndex: header(4),
    batchSize: Math.max(1, header(3)),
  };
}
