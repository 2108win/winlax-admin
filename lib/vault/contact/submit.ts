import "server-only";

import type { Locale } from "@/lib/vault/i18n-config";
import { insertContactMessage } from "@/lib/vault/contact/repository";
import {
  parseContactForm,
  type ContactField,
  type ContactFieldCode,
} from "@/lib/vault/contact/validate";
import {
  findBlockingRateLimit,
  recordSecurityEvent,
} from "@/lib/vault/security/events";
import {
  CONTACT_ACTOR_RULE,
  CONTACT_GLOBAL_RULE,
} from "@/lib/vault/security/policies";
import { isDatabaseConfigured } from "@/lib/vault/db/client";

export type ContactSubmission =
  | Readonly<{ status: "success" }>
  | Readonly<{
      status: "error";
      reason: "validation";
      fieldErrors: Partial<Record<ContactField, ContactFieldCode>>;
    }>
  | Readonly<{
      status: "error";
      reason: "rate_limited";
      retryAfterSeconds: number;
    }>
  | Readonly<{ status: "error"; reason: "unavailable" }>;

/**
 * One contact submission, shared by the form's Server Action and the public
 * /api/contact endpoint (used by PhimWin's "Báo lỗi"): same validation,
 * honeypot, rate limits and storage either way.
 */
export async function submitContact(
  formData: FormData,
  locale: Locale,
  actor: string,
): Promise<ContactSubmission> {
  if (!isDatabaseConfigured()) {
    return { reason: "unavailable", status: "error" };
  }

  const parsed = parseContactForm(formData, locale);
  if (!parsed.ok) {
    // A bot filled the decoy field: answer like a success so it learns nothing, store nothing.
    if (parsed.spam) return { status: "success" };
    return {
      fieldErrors: parsed.errors,
      reason: "validation",
      status: "error",
    };
  }

  try {
    const blocked = await findBlockingRateLimit(
      [CONTACT_ACTOR_RULE, CONTACT_GLOBAL_RULE],
      actor,
    );
    if (blocked) {
      return {
        reason: "rate_limited",
        retryAfterSeconds: blocked.retryAfterSeconds,
        status: "error",
      };
    }

    await insertContactMessage(parsed.value, actor);
  } catch (error) {
    console.error(
      "[contact] could not store a message:",
      error instanceof Error ? error.message : error,
    );
    return { reason: "unavailable", status: "error" };
  }

  // The message is saved; failing to count it only loosens the limit slightly.
  try {
    await recordSecurityEvent({ actorHash: actor, kind: "contact_submitted" });
  } catch (error) {
    console.error(
      "[contact] could not record the submission:",
      error instanceof Error ? error.message : error,
    );
  }

  return { status: "success" };
}
