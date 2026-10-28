import { createHmac } from "node:crypto";

/**
 * The client IP as reported by the hosting proxy. Vercel overwrites these headers, so they
 * can be trusted there. Anywhere else a client could spoof them to dodge the per-actor
 * limit; the global limits in policies.ts still bound the damage.
 */
export function pickClientIp(headers: Pick<Headers, "get">): string {
  const realIp = headers.get("x-real-ip")?.trim();
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = realIp || forwarded;
  return candidate && candidate.length <= 64 ? candidate : "unknown";
}

/** A stable pseudonym for rate limiting. The raw IP is never stored. */
export function hashActor(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`actor:v1:${ip}`)
    .digest("hex")
    .slice(0, 32);
}
