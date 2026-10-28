import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";

import { hashActor, pickClientIp } from "./actor";
import { recordSecurityEvent, type SecurityEvent } from "./events";

/** Pseudonymous id of the caller, stable per client IP. Call from a request context only. */
export async function getRequestActor(): Promise<string> {
  const secret = process.env.SECURITY_HASH_SECRET?.trim() || "unconfigured";
  return hashActor(pickClientIp(await headers()), secret);
}

/**
 * Writes an audit event after the response has been sent, so it never slows the user down.
 * A failed audit write is logged and ignored: it must not break the action being audited.
 */
export function auditInBackground(event: SecurityEvent): void {
  after(async () => {
    try {
      await recordSecurityEvent(event);
    } catch (error) {
      console.error(
        "[security] audit write failed:",
        error instanceof Error ? error.message : error,
      );
    }
  });
}
