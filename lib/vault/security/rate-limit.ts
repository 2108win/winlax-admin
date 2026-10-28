export type RateLimitRule = Readonly<{
  /** Events with this `kind` are counted. */
  kind: string;
  /** How many events are allowed inside the window. */
  limit: number;
  /** "actor" counts one client; "global" counts everyone. */
  scope: "actor" | "global";
  windowMs: number;
}>;

export type RateLimitDecision =
  | Readonly<{ allowed: true }>
  | Readonly<{ allowed: false; retryAfterSeconds: number }>;

/**
 * `recentEventTimes` are the newest events inside the window (newest first, at most `limit`
 * of them). Once `limit` events exist, the next one is allowed when the oldest of them
 * leaves the window.
 */
export function decideRateLimit(
  recentEventTimes: readonly Date[],
  rule: RateLimitRule,
  now: number,
): RateLimitDecision {
  if (recentEventTimes.length < rule.limit) return { allowed: true };

  const blockingEvent = recentEventTimes[rule.limit - 1];
  const retryAtMs = blockingEvent.getTime() + rule.windowMs;
  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((retryAtMs - now) / 1_000)),
  };
}

export function formatRetryAfter(seconds: number): string {
  if (seconds < 90) return `${seconds} giây`;
  return `${Math.ceil(seconds / 60)} phút`;
}
