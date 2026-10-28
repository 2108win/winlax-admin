import { parseTotpSource } from "./totp-source";
import type { VaultPayload } from "./types";

export type CredentialInput = Readonly<{
  account: string;
  issuer: string;
  notes?: string;
  password?: string;
  totpSource?: string;
  website?: string;
}>;

export type CredentialValidationError = Readonly<{
  field:
    | "account"
    | "credentialPassword"
    | "issuer"
    | "notes"
    | "secret"
    | "website";
  message: string;
}>;

export class InvalidCredentialError extends Error {
  readonly issues: CredentialValidationError[];

  constructor(issues: CredentialValidationError[]) {
    super("Thông tin tài khoản chưa hợp lệ.");
    this.name = "InvalidCredentialError";
    this.issues = issues;
  }
}

function normalizeWebsite(value: string): string {
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//iu.test(value)
    ? value
    : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Địa chỉ website không hợp lệ.");
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Website phải dùng HTTP/HTTPS và không chứa thông tin đăng nhập.",
    );
  }

  return url.toString();
}

function labelIssues(
  issuer: string,
  account: string,
): CredentialValidationError[] {
  const issues: CredentialValidationError[] = [];
  if (!issuer)
    issues.push({ field: "issuer", message: "Hãy nhập tên dịch vụ." });
  else if (issuer.length > 80) {
    issues.push({ field: "issuer", message: "Tên dịch vụ tối đa 80 ký tự." });
  }

  if (!account)
    issues.push({ field: "account", message: "Hãy nhập tài khoản." });
  else if (account.length > 160) {
    issues.push({ field: "account", message: "Tài khoản tối đa 160 ký tự." });
  }
  return issues;
}

/** The new service name and account for an entry that is being renamed. */
export function prepareEntryLabel(
  input: Readonly<{ account: string; issuer: string }>,
): Readonly<{ account: string; issuer: string }> {
  const account = input.account.trim();
  const issuer = input.issuer.trim();
  const issues = labelIssues(issuer, account);
  if (issues.length > 0) throw new InvalidCredentialError(issues);
  return { account, issuer };
}

export function prepareCredentialPayload(input: CredentialInput): VaultPayload {
  const account = input.account.trim();
  const issuer = input.issuer.trim();
  const notes = input.notes?.trim() || undefined;
  const password = input.password || undefined;
  const totpSource = input.totpSource?.trim() || "";
  const websiteInput = input.website?.trim() || "";
  const issues = labelIssues(issuer, account);

  if (password && password.length > 4_096) {
    issues.push({
      field: "credentialPassword",
      message: "Mật khẩu tài khoản tối đa 4.096 ký tự.",
    });
  }
  if (notes && notes.length > 5_000) {
    issues.push({ field: "notes", message: "Ghi chú tối đa 5.000 ký tự." });
  }

  let website: string | undefined;
  if (websiteInput) {
    if (websiteInput.length > 2_048) {
      issues.push({ field: "website", message: "Website tối đa 2.048 ký tự." });
    } else {
      try {
        website = normalizeWebsite(websiteInput);
      } catch (error) {
        issues.push({
          field: "website",
          message:
            error instanceof Error ? error.message : "Website không hợp lệ.",
        });
      }
    }
  }

  let totp: VaultPayload["totp"];
  if (totpSource) {
    try {
      const parsed = parseTotpSource(totpSource);
      totp = {
        algorithm: parsed.algorithm,
        digits: parsed.digits,
        period: parsed.period,
        secret: parsed.secret,
      };
    } catch (error) {
      issues.push({
        field: "secret",
        message:
          error instanceof Error ? error.message : "Secret 2FA không hợp lệ.",
      });
    }
  }

  if (!password && !notes && !totp) {
    issues.push({
      field: "credentialPassword",
      message: "Hãy nhập mật khẩu, ghi chú riêng hoặc secret 2FA.",
    });
  }

  if (issues.length > 0) throw new InvalidCredentialError(issues);

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
