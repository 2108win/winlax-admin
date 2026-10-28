import type { RateLimitRule } from "./rate-limit";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 5 wrong passwords per client in 15 minutes. */
export const UNLOCK_ACTOR_RULE: RateLimitRule = {
  kind: "unlock_failed",
  limit: 5,
  scope: "actor",
  windowMs: 15 * MINUTE,
};

/** Caps guessing from many addresses at once; locks the owner out too, but only for a while. */
export const UNLOCK_GLOBAL_RULE: RateLimitRule = {
  kind: "unlock_failed",
  limit: 30,
  scope: "global",
  windowMs: HOUR,
};

/** 3 contact messages per client per hour. */
export const CONTACT_ACTOR_RULE: RateLimitRule = {
  kind: "contact_submitted",
  limit: 3,
  scope: "actor",
  windowMs: HOUR,
};

/** A flood cap that also keeps the free-tier database from filling up. */
export const CONTACT_GLOBAL_RULE: RateLimitRule = {
  kind: "contact_submitted",
  limit: 40,
  scope: "global",
  windowMs: DAY,
};

/** Audit/rate-limit rows older than this are deleted by the daily keep-alive job. */
export const SECURITY_EVENT_RETENTION_DAYS = 90;
