import "server-only";


import { createDbClient, type DbClient } from "@/lib/vault/db/client";

import {
  decideRateLimit,
  type RateLimitDecision,
  type RateLimitRule,
} from "./rate-limit";

export type SecurityEventKind =
  | "backup_exported"
  | "contact_submitted"
  | "details_revealed"
  | "entry_created"
  | "entry_deleted"
  | "entry_renamed"
  | "message_deleted"
  | "sessions_revoked"
  | "unlock_failed"
  | "unlock_ok"
  | "unlock_totp_disabled"
  | "unlock_totp_enabled";

export type SecurityEvent = Readonly<{
  actorHash: string;
  kind: SecurityEventKind;
  /** Non-sensitive context only (ids, counts). Never passwords, secrets or message text. */
  meta?: Record<string, string | number | boolean>;
}>;

export async function recordSecurityEvent(
  event: SecurityEvent,
  client: DbClient = createDbClient(),
): Promise<void> {
  const { error } = await client.from("security_events").insert({
    actor_hash: event.actorHash,
    kind: event.kind,
    meta: event.meta ?? {},
  });
  if (error) throw new Error(`Không thể ghi sự kiện bảo mật: ${error.message}`);
}

/** Throws when the event store is unreachable, so callers can fail closed. */
export async function checkRateLimit(
  rule: RateLimitRule,
  actorHash: string,
  client: DbClient = createDbClient(),
  now: number = Date.now(),
): Promise<RateLimitDecision> {
  let query = client
    .from("security_events")
    .select("created_at")
    .eq("kind", rule.kind)
    .gte("created_at", new Date(now - rule.windowMs).toISOString());
  if (rule.scope === "actor") query = query.eq("actor_hash", actorHash);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(rule.limit);
  if (error) throw new Error(`Không thể kiểm tra giới hạn: ${error.message}`);

  const times = ((data ?? []) as { created_at: string }[]).map(
    (row) => new Date(row.created_at),
  );
  return decideRateLimit(times, rule, now);
}

/** Returns the first rule that blocks, or null when every rule allows the request. */
export async function findBlockingRateLimit(
  rules: readonly RateLimitRule[],
  actorHash: string,
  client: DbClient = createDbClient(),
  now: number = Date.now(),
): Promise<Extract<RateLimitDecision, { allowed: false }> | null> {
  for (const rule of rules) {
    const decision = await checkRateLimit(rule, actorHash, client, now);
    if (!decision.allowed) return decision;
  }
  return null;
}

export async function pruneSecurityEvents(
  olderThanDays: number,
  client: DbClient = createDbClient(),
  now: number = Date.now(),
): Promise<void> {
  const cutoff = new Date(now - olderThanDays * 24 * 60 * 60 * 1_000);
  const { error } = await client
    .from("security_events")
    .delete()
    .lt("created_at", cutoff.toISOString());
  if (error) throw new Error(`Không thể dọn sự kiện cũ: ${error.message}`);
}
