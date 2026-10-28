import { expandMigrationSource, isMigrationSource } from "./migration";
import type {
  TotpAlgorithm,
  VaultImportInput,
  VaultPayload,
  VaultTotp,
} from "./types";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const MIN_SECRET_BYTES = 10;

export const MAX_IMPORT_ENTRIES = 50;
export const MAX_IMPORT_SOURCE_LENGTH = 4_096;

export type BulkImportRow = Readonly<{
  error?: string;
  input?: VaultImportInput;
  /** The account's name, for rows expanded from a Google Authenticator transfer QR. */
  label?: string;
  lineNumber: number;
  payload?: VaultPayload;
}>;

export function normalizeBase32Secret(value: string): string {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, "")
    .replace(/=+$/u, "");

  if (!normalized) {
    throw new Error("Hãy nhập secret hoặc URI otpauth.");
  }

  if (!/^[A-Z2-7]+$/u.test(normalized)) {
    throw new Error("Secret chỉ được chứa ký tự Base32 A–Z và 2–7.");
  }

  const decodedByteLength = Math.floor(
    (normalized.length * Math.log2(BASE32_ALPHABET.length)) / 8,
  );
  if (decodedByteLength < MIN_SECRET_BYTES) {
    throw new Error(
      "Secret quá ngắn. Hãy dùng khóa Base32 tối thiểu 16 ký tự.",
    );
  }

  return normalized;
}

function parseAlgorithm(value: string | null): TotpAlgorithm {
  const algorithm = (value ?? "SHA1").toUpperCase();
  if (
    algorithm !== "SHA1" &&
    algorithm !== "SHA256" &&
    algorithm !== "SHA512"
  ) {
    throw new Error("Thuật toán TOTP chưa được hỗ trợ.");
  }
  return algorithm;
}

function parseDigits(value: string | null): 6 | 8 {
  const digits = Number(value ?? 6);
  if (digits !== 6 && digits !== 8) {
    throw new Error("Mã TOTP phải có 6 hoặc 8 chữ số.");
  }
  return digits;
}

function parsePeriod(value: string | null): number {
  const period = Number(value ?? 30);
  if (!Number.isInteger(period) || period < 15 || period > 120) {
    throw new Error("Chu kỳ TOTP phải nằm trong khoảng 15–120 giây.");
  }
  return period;
}

export function parseTotpSource(
  source: string,
): Partial<Pick<VaultPayload, "account" | "issuer">> & VaultTotp {
  const trimmed = source.trim();
  if (trimmed.length > MAX_IMPORT_SOURCE_LENGTH) {
    throw new Error("Dữ liệu 2FA vượt quá giới hạn cho phép.");
  }

  if (isMigrationSource(trimmed)) {
    throw new Error(
      "Đây là QR chuyển tài khoản Google Authenticator. Hãy nhập nó ở tab Ảnh QR, Camera hoặc Hàng loạt.",
    );
  }

  if (!trimmed.toLowerCase().startsWith("otpauth://")) {
    return {
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: normalizeBase32Secret(trimmed),
    };
  }

  let uri: URL;
  try {
    uri = new URL(trimmed);
  } catch {
    throw new Error("URI otpauth không hợp lệ.");
  }

  if (uri.protocol !== "otpauth:" || uri.hostname.toLowerCase() !== "totp") {
    throw new Error("Vault hiện chỉ hỗ trợ URI otpauth loại TOTP.");
  }

  let label: string;
  try {
    label = decodeURIComponent(uri.pathname.replace(/^\//u, ""));
  } catch {
    throw new Error("Nhãn tài khoản trong URI otpauth không hợp lệ.");
  }
  const separatorIndex = label.indexOf(":");
  const labelIssuer =
    separatorIndex >= 0 ? label.slice(0, separatorIndex).trim() : "";
  const account = (
    separatorIndex >= 0 ? label.slice(separatorIndex + 1) : label
  ).trim();
  const issuer = (uri.searchParams.get("issuer") ?? labelIssuer).trim();

  return {
    account: account || undefined,
    algorithm: parseAlgorithm(uri.searchParams.get("algorithm")),
    digits: parseDigits(uri.searchParams.get("digits")),
    issuer: issuer || undefined,
    period: parsePeriod(uri.searchParams.get("period")),
    secret: normalizeBase32Secret(uri.searchParams.get("secret") ?? ""),
  };
}

export function prepareVaultPayload(input: VaultImportInput): VaultPayload {
  if (typeof input.source !== "string") {
    throw new Error("Dữ liệu 2FA không hợp lệ.");
  }

  const parsed = parseTotpSource(input.source);
  const issuer = (input.issuer?.trim() || parsed.issuer || "").trim();
  const account = (input.account?.trim() || parsed.account || "").trim();

  if (!issuer) throw new Error("Thiếu tên dịch vụ.");
  if (issuer.length > 80) throw new Error("Tên dịch vụ tối đa 80 ký tự.");
  if (!account) throw new Error("Thiếu tài khoản.");
  if (account.length > 160) throw new Error("Tài khoản tối đa 160 ký tự.");

  return {
    account,
    issuer,
    totp: {
      algorithm: parsed.algorithm,
      digits: parsed.digits,
      period: parsed.period,
      secret: parsed.secret,
    },
    version: 2,
  };
}

function parseDelimitedLine(line: string): VaultImportInput {
  const delimiter = line.includes("|") ? "|" : line.includes("\t") ? "\t" : ",";
  const parts = line.split(delimiter).map((part) => part.trim());
  if (parts.length !== 3) {
    throw new Error(
      "Dùng URI otpauth hoặc định dạng: dịch vụ | tài khoản | secret.",
    );
  }

  return { account: parts[1], issuer: parts[0], source: parts[2] };
}

export function parseBulkImportText(value: string): BulkImportRow[] {
  const rows: BulkImportRow[] = [];
  const fingerprints = new Set<string>();
  const lines = value.split(/\r?\n/u);
  let entryCount = 0;

  const addRow = (
    lineNumber: number,
    read: () => VaultImportInput,
    label?: string,
  ) => {
    entryCount += 1;
    if (entryCount > MAX_IMPORT_ENTRIES) {
      rows.push({
        error: `Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ENTRIES} mã.`,
        label,
        lineNumber,
      });
      return;
    }

    try {
      const input = read();
      const payload = prepareVaultPayload(input);
      const fingerprint = [
        payload.issuer.toLocaleLowerCase("vi"),
        payload.account.toLocaleLowerCase("vi"),
        payload.totp?.secret,
        payload.totp?.algorithm,
        payload.totp?.digits,
        payload.totp?.period,
      ].join("\u0000");

      if (fingerprints.has(fingerprint)) {
        throw new Error("Mã này bị lặp trong danh sách nhập.");
      }
      fingerprints.add(fingerprint);
      rows.push({ input, label, lineNumber, payload });
    } catch (error) {
      rows.push({
        error: error instanceof Error ? error.message : "Dữ liệu không hợp lệ.",
        label,
        lineNumber,
      });
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    if (isMigrationSource(line)) {
      let accounts: ReturnType<typeof expandMigrationSource>["accounts"];
      try {
        accounts = expandMigrationSource(line).accounts;
      } catch (error) {
        addRow(index + 1, () => {
          throw error;
        });
        return;
      }
      for (const account of accounts) {
        addRow(
          index + 1,
          () => {
            if (!account.input) throw new Error(account.error);
            if (!account.input.issuer) {
              // The service name cannot be typed into a transfer link; the image tab can.
              throw new Error(
                "Thiếu tên dịch vụ. Hãy nhập QR này ở tab Ảnh QR để điền tên.",
              );
            }
            return account.input;
          },
          account.label,
        );
      }
      return;
    }

    addRow(index + 1, () =>
      line.toLowerCase().startsWith("otpauth")
        ? { source: line }
        : parseDelimitedLine(line),
    );
  });

  return rows;
}
