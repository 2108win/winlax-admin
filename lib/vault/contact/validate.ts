import type { Locale } from "@/lib/vault/i18n-config";

export const CONTACT_LIMITS = {
  email: 254,
  messageMax: 2_000,
  messageMin: 10,
  name: 80,
} as const;

/** Name of the decoy field. Real visitors never see it, so a filled value means a bot. */
export const CONTACT_HONEYPOT_FIELD = "website";

export type ContactField = "email" | "message" | "name";
export type ContactFieldCode =
  "invalid" | "required" | "too_long" | "too_short";

export type ContactInput = Readonly<{
  email: string;
  locale: Locale;
  message: string;
  name: string;
}>;

export type ContactParseResult =
  | Readonly<{ ok: true; value: ContactInput }>
  | Readonly<{ ok: false; spam: true }>
  | Readonly<{
      errors: Partial<Record<ContactField, ContactFieldCode>>;
      ok: false;
      spam: false;
    }>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u;
// Control characters other than tab and newline have no place in a name, address or message.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;

// Postgres CHECK constraints count code points, JavaScript's `.length` counts UTF-16 units
// (an emoji is 2). Counting code points keeps the app and the database in agreement.
const length = (value: string): number => Array.from(value).length;

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export function parseContactForm(
  formData: FormData,
  locale: Locale,
): ContactParseResult {
  if (readText(formData, CONTACT_HONEYPOT_FIELD).trim() !== "") {
    return { ok: false, spam: true };
  }

  const name = readText(formData, "name")
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim();
  const email = readText(formData, "email")
    .replace(CONTROL_CHARACTERS, "")
    .trim();
  const message = readText(formData, "message")
    .replace(/\r\n?/gu, "\n")
    .replace(CONTROL_CHARACTERS, "")
    .trim();

  const errors: Partial<Record<ContactField, ContactFieldCode>> = {};
  if (!name) errors.name = "required";
  else if (length(name) > CONTACT_LIMITS.name) errors.name = "too_long";

  if (!email) errors.email = "required";
  else if (length(email) > CONTACT_LIMITS.email) errors.email = "too_long";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "invalid";

  if (!message) errors.message = "required";
  else if (length(message) < CONTACT_LIMITS.messageMin)
    errors.message = "too_short";
  else if (length(message) > CONTACT_LIMITS.messageMax)
    errors.message = "too_long";

  if (Object.keys(errors).length > 0) return { errors, ok: false, spam: false };
  return { ok: true, value: { email, locale, message, name } };
}
