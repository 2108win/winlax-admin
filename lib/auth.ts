import { cookies } from "next/headers";

import { decrypt, encrypt, randomToken, sha256 } from "./crypto";
import { query } from "./db";
import { deviceLabel } from "./device-label";
import { clientIp, isSameOrigin, json } from "./security";
import { verifyCode } from "./totp";

export const SESSION_COOKIE = "__Host-wa_session";
export const PENDING_COOKIE = "__Host-wa_pending";
export const OAUTH_COOKIE = "__Host-wa_oauth";
export const DEVICE_COOKIE = "__Host-wa_device";

const SESSION_HOURS = 12;
const PENDING_MINUTES = 10;
/** Dangerous actions (terminal, SQL writes, env, vault) need a fresh 2FA code. */
export const STEP_UP_MINUTES = 10;

/** A remembered device skips 2FA at login; every use keeps it for this long again. */
export const TRUSTED_DEVICE_DAYS = 90;

const FAILURE_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_IP = 5;
const MAX_FAILURES_GLOBAL_PER_HOUR = 20;

export type Session = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  stepupAt: Date | null;
};

const secureCookie = {
  httpOnly: true,
  secure: true,
  path: "/",
} as const;

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<{
    email: string;
    token_hash: string;
    expires_at: Date;
    stepup_at: Date | null;
  }>(
    `update admin_sessions set last_seen_at = now()
      where token_hash = $1 and expires_at > now()
      returning email, token_hash, expires_at, stepup_at`,
    [sha256(token)],
  );
  const row = rows[0];
  return row
    ? {
        email: row.email,
        tokenHash: row.token_hash,
        expiresAt: row.expires_at,
        stepupAt: row.stepup_at,
      }
    : null;
}

/**
 * For route handlers: a session, or the error response to return.
 * Non-GET requests must also come from this site.
 */
export async function requireApiSession(
  request: Request,
  options: { stepUp?: boolean } = {},
): Promise<Session | Response> {
  if (request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request)) {
    return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  }
  const session = await getSession();
  if (!session) return json({ error: "Chưa đăng nhập." }, 401);
  if (options.stepUp && !hasFreshStepUp(session)) {
    return json({ error: "Cần nhập lại mã 2FA.", stepUp: true }, 428);
  }
  return session;
}

export function hasFreshStepUp(session: Session): boolean {
  return (
    session.stepupAt !== null &&
    Date.now() - session.stepupAt.getTime() < STEP_UP_MINUTES * 60_000
  );
}

/**
 * Opens a session. Right after a 2FA code the step-up window starts at once; a login
 * from a remembered device had no code, so dangerous actions still ask for one first.
 */
export async function createSession(
  email: string,
  request: Request,
  options: { stepUp?: boolean } = {},
): Promise<void> {
  const token = randomToken();
  await query(
    `insert into admin_sessions (token_hash, email, expires_at, stepup_at, ip, user_agent)
     values ($1, $2, now() + make_interval(hours => $3), case when $6 then now() end, $4, $5)`,
    [
      sha256(token),
      email,
      SESSION_HOURS,
      clientIp(request),
      request.headers.get("user-agent"),
      options.stepUp ?? true,
    ],
  );
  await query("delete from admin_sessions where expires_at < now()");
  (await cookies()).set(SESSION_COOKIE, token, {
    ...secureCookie,
    sameSite: "strict",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from admin_sessions where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/* ---------- Google OAuth state (between /start and /callback) ---------- */

export async function saveOAuthState(state: string, verifier: string): Promise<void> {
  (await cookies()).set(OAUTH_COOKIE, encrypt(JSON.stringify({ state, verifier })), {
    ...secureCookie,
    // Lax: Google sends the user back with a cross-site top-level GET.
    sameSite: "lax",
    maxAge: 600,
  });
}

export async function takeOAuthState(): Promise<{ state: string; verifier: string } | null> {
  const jar = await cookies();
  const sealed = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  const plain = sealed ? decrypt(sealed) : null;
  return plain ? (JSON.parse(plain) as { state: string; verifier: string }) : null;
}

/* ---------- Remembered devices (skip 2FA at login) ---------- */

/**
 * A device is remembered by a random token in a long-lived cookie, not by its IP:
 * home IPs change and every request arrives through Cloudflare. The token alone
 * signs nobody in; it only replaces the 2FA code after Google or the password.
 */
async function rememberedDeviceId(email: string): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<{ id: string }>(
    `update admin_trusted_devices
        set last_used_at = now(), expires_at = now() + make_interval(days => $3)
      where token_hash = $1 and email = $2 and expires_at > now()
      returning id`,
    [sha256(token), email, TRUSTED_DEVICE_DAYS],
  );
  if (!rows[0]) return null;
  jar.set(DEVICE_COOKIE, token, deviceCookieOptions());
  return rows[0].id;
}

// Lax, not strict: the cookie must come along on the cross-site redirect back from Google.
const deviceCookieOptions = () => ({
  ...secureCookie,
  sameSite: "lax" as const,
  maxAge: TRUSTED_DEVICE_DAYS * 86_400,
});

export async function rememberThisDevice(email: string, request: Request): Promise<void> {
  const token = randomToken();
  const userAgent = request.headers.get("user-agent")?.slice(0, 400) ?? null;
  await query(
    `insert into admin_trusted_devices (token_hash, email, label, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5, now() + make_interval(days => $6))`,
    [sha256(token), email, deviceLabel(userAgent), userAgent, clientIp(request), TRUSTED_DEVICE_DAYS],
  );
  await query("delete from admin_trusted_devices where expires_at < now()");
  (await cookies()).set(DEVICE_COOKIE, token, deviceCookieOptions());
}

/**
 * After Google or the password: a remembered device signs in at once, any other
 * device goes on to the 2FA code. Returns where the browser goes next.
 */
export async function beginLogin(
  email: string,
  request: Request,
): Promise<{ next: string; deviceId: string | null }> {
  const deviceId = await rememberedDeviceId(email);
  if (deviceId) {
    await createSession(email, request, { stepUp: false });
    return { deviceId, next: "/" };
  }
  await createPendingLogin(email);
  return { deviceId: null, next: "/login/2fa" };
}

export type TrustedDevice = {
  id: string;
  label: string;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
};

export async function listTrustedDevices(email: string): Promise<TrustedDevice[]> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  const rows = await query<{
    id: string;
    label: string | null;
    ip: string | null;
    created_at: Date;
    last_used_at: Date;
    expires_at: Date;
    current: boolean;
  }>(
    `select id, label, ip, created_at, last_used_at, expires_at, token_hash = $2 as current
       from admin_trusted_devices
      where email = $1 and expires_at > now()
      order by last_used_at desc`,
    [email, token ? sha256(token) : ""],
  );
  return rows.map((row) => ({
    createdAt: row.created_at,
    current: row.current,
    expiresAt: row.expires_at,
    id: row.id,
    ip: row.ip,
    label: row.label ?? "Thiết bị không rõ",
    lastUsedAt: row.last_used_at,
  }));
}

/** Forgets one remembered device, or all of them when id is null. Returns how many. */
export async function forgetTrustedDevices(email: string, id: string | null): Promise<number> {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  const rows = await query<{ token_hash: string }>(
    `delete from admin_trusted_devices
      where email = $1 and ($2::uuid is null or id = $2::uuid)
      returning token_hash`,
    [email, id],
  );
  if (token && rows.some((row) => row.token_hash === sha256(token))) jar.delete(DEVICE_COOKIE);
  return rows.length;
}

/* ---------- Pending login (Google or password done, 2FA not yet) ---------- */

export async function createPendingLogin(email: string): Promise<void> {
  const token = randomToken();
  await query(
    `insert into admin_pending_logins (token_hash, email, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [sha256(token), email, PENDING_MINUTES],
  );
  await query("delete from admin_pending_logins where expires_at < now()");
  (await cookies()).set(PENDING_COOKIE, token, {
    ...secureCookie,
    sameSite: "lax",
    maxAge: PENDING_MINUTES * 60,
  });
}

export type PendingLogin = { tokenHash: string; email: string; enrollSecret: string | null };

export async function getPendingLogin(): Promise<PendingLogin | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<{ token_hash: string; email: string; enroll_secret: string | null }>(
    "select token_hash, email, enroll_secret from admin_pending_logins where token_hash = $1 and expires_at > now()",
    [sha256(token)],
  );
  const row = rows[0];
  return row
    ? {
        tokenHash: row.token_hash,
        email: row.email,
        enrollSecret: row.enroll_secret ? decrypt(row.enroll_secret) : null,
      }
    : null;
}

export async function setEnrollSecret(pending: PendingLogin, secret: string): Promise<void> {
  await query("update admin_pending_logins set enroll_secret = $2 where token_hash = $1", [
    pending.tokenHash,
    encrypt(secret),
  ]);
}

export async function finishPendingLogin(pending: PendingLogin): Promise<void> {
  await query("delete from admin_pending_logins where token_hash = $1", [pending.tokenHash]);
  (await cookies()).delete(PENDING_COOKIE);
}

/* ---------- TOTP secret, replay guard and rate limit ---------- */

export async function getTotpSecret(): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "select value from admin_settings where key = 'totp_secret'",
  );
  return rows[0] ? decrypt(rows[0].value) : null;
}

export async function saveTotpSecret(secret: string): Promise<void> {
  await query(
    `insert into admin_settings (key, value) values ('totp_secret', $1)
     on conflict (key) do nothing`,
    [encrypt(secret)],
  );
}

/* ---------- Optional login password (replaces the Google step; 2FA unless the device is remembered) ---------- */

/** The scrypt hash of the admin password, or null when password login is off. */
export async function getPasswordHash(): Promise<string | null> {
  const rows = await query<{ value: string }>(
    "select value from admin_settings where key = 'password_hash'",
  );
  return rows[0]?.value ?? null;
}

export async function setPasswordHash(hash: string): Promise<void> {
  await query(
    `insert into admin_settings (key, value) values ('password_hash', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [hash],
  );
}

export async function clearPasswordHash(): Promise<void> {
  await query("delete from admin_settings where key = 'password_hash'");
}

/**
 * Only wrong 2FA codes and passwords count: a Google login with another account
 * must not be able to fill the global bucket and lock the real admin out.
 */
export async function isRateLimited(request: Request): Promise<boolean> {
  const rows = await query<{ by_ip: string; global: string }>(
    `select
       count(*) filter (where ip = $1 and at > now() - make_interval(mins => $2)) as by_ip,
       count(*) filter (where at > now() - interval '1 hour') as global
     from admin_auth_failures
     where kind in ('totp', 'stepup', 'password')`,
    [clientIp(request), FAILURE_WINDOW_MINUTES],
  );
  return (
    Number(rows[0]?.by_ip ?? 0) >= MAX_FAILURES_PER_IP ||
    Number(rows[0]?.global ?? 0) >= MAX_FAILURES_GLOBAL_PER_HOUR
  );
}

export async function recordFailure(request: Request, kind: string): Promise<void> {
  await query("insert into admin_auth_failures (ip, kind) values ($1, $2)", [
    clientIp(request),
    kind,
  ]);
  await query("delete from admin_auth_failures where at < now() - interval '1 day'");
}

/** Verifies a code once: a counter already used cannot be used again. */
export async function consumeTotp(secret: string, code: string): Promise<boolean> {
  const counter = verifyCode(secret, code);
  if (counter === null) return false;
  const rows = await query(
    `insert into admin_settings (key, value) values ('totp_last_counter', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()
       where admin_settings.value::bigint < excluded.value::bigint
     returning key`,
    [String(counter)],
  );
  return rows.length === 1;
}

export async function markStepUp(session: Session): Promise<void> {
  await query("update admin_sessions set stepup_at = now() where token_hash = $1", [
    session.tokenHash,
  ]);
}
