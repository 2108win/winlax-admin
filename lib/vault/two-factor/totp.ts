import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { TotpAlgorithm, VaultTotp } from "./types";
import { normalizeBase32Secret } from "./totp-source";

export { normalizeBase32Secret, parseTotpSource } from "./totp-source";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(value: string): Buffer {
  let bits = "";
  const bytes: number[] = [];

  for (const character of value.replace(/=+$/u, "")) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) {
      throw new Error("Secret chỉ được chứa ký tự Base32 A–Z và 2–7.");
    }
    bits += index.toString(2).padStart(5, "0");
  }

  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }

  return Buffer.from(bytes);
}

function encodeBase32(bytes: Buffer): string {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");

  let output = "";
  for (let offset = 0; offset < bits.length; offset += 5) {
    output +=
      BASE32_ALPHABET[
        Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)
      ];
  }
  return output;
}

/** A fresh 160-bit secret (RFC 4226's recommended size) as 32 Base32 characters. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(20));
}

/** True for a secret this app generated: exactly 32 Base32 characters. */
export function isGeneratedTotpSecret(value: string): boolean {
  return /^[A-Z2-7]{32}$/u.test(value);
}

export function generateTotp(
  secret: string,
  options: Readonly<{
    algorithm?: TotpAlgorithm;
    digits?: 6 | 8;
    period?: number;
    timestamp?: number;
  }> = {},
): string {
  const algorithm = (
    options.algorithm ?? "SHA1"
  ).toLowerCase() as Lowercase<TotpAlgorithm>;
  const digits = options.digits ?? 6;
  const period = options.period ?? 30;
  const timestamp = options.timestamp ?? Date.now();
  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac(
    algorithm,
    decodeBase32(normalizeBase32Secret(secret)),
  )
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function generateTotpWindow(
  payload: VaultTotp,
  timestamp = Date.now(),
): Readonly<{ currentCode: string; expiresAt: number; nextCode: string }> {
  const periodMs = payload.period * 1000;
  const expiresAt = (Math.floor(timestamp / periodMs) + 1) * periodMs;
  const options = {
    algorithm: payload.algorithm,
    digits: payload.digits,
    period: payload.period,
  } as const;

  return {
    currentCode: generateTotp(payload.secret, { ...options, timestamp }),
    expiresAt,
    nextCode: generateTotp(payload.secret, {
      ...options,
      timestamp: expiresAt + 1,
    }),
  };
}

const TOTP_PERIOD_SECONDS = 30;

/**
 * Checks a 6-digit SHA-1 code against the current 30-second step and one step either side
 * (clock drift), comparing in constant time. Returns the matching step so the caller can
 * refuse to accept it twice, or null when the code does not match.
 */
export function verifyTotpCode(
  secret: string,
  code: string,
  timestamp = Date.now(),
): number | null {
  const candidate = code.replace(/\s+/gu, "");
  if (!/^\d{6}$/u.test(candidate)) return null;

  const currentStep = Math.floor(timestamp / 1000 / TOTP_PERIOD_SECONDS);
  let matchedStep: number | null = null;
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    const expected = generateTotp(secret, {
      timestamp: step * TOTP_PERIOD_SECONDS * 1000,
    });
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) {
      matchedStep = step;
    }
  }
  return matchedStep;
}

/** The otpauth:// address an authenticator app reads from the setup QR code. */
export function buildOtpauthUri(
  secret: string,
  label: string,
  issuer: string,
): string {
  const parameters = new URLSearchParams({
    algorithm: "SHA1",
    digits: "6",
    issuer,
    period: String(TOTP_PERIOD_SECONDS),
    secret,
  });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?${parameters.toString()}`;
}
