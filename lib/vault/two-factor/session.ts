import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getVaultConfig } from "./config";
import { getVaultAccessPath } from "./path";
import {
  VAULT_SESSION_SECONDS,
  VaultStoreError,
  findVaultSession,
  insertVaultSession,
  isVaultSessionActive,
  revokeVaultSession,
} from "./vault-store";

const COOKIE_NAME = "winlax_2fa_session";
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * The cookie is `<session id>.<signature>`. The signature covers the vault password, so
 * changing the password still signs every browser out; the database row decides the rest
 * (revoked, expired, idle).
 */
function sign(id: string, masterKey: Buffer, password: string): string {
  return createHmac("sha256", masterKey)
    .update(`session:v2:${password}:${id}`)
    .digest("base64url");
}

function safeEqual(first: string, second: string): boolean {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

export function verifyVaultPassword(candidate: string): boolean {
  const { masterKey, password } = getVaultConfig();
  const candidateDigest = createHmac("sha256", masterKey)
    .update(candidate)
    .digest("base64url");
  const passwordDigest = createHmac("sha256", masterKey)
    .update(password)
    .digest("base64url");
  return safeEqual(candidateDigest, passwordDigest);
}

const cookieOptions = () =>
  ({
    httpOnly: true,
    path: getVaultAccessPath(),
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  }) as const;

/** Creates a session row for this browser and sets its cookie. Throws if the store fails. */
export async function startVaultSession(actorHash: string): Promise<void> {
  const { masterKey, password } = getVaultConfig();
  const id = await insertVaultSession(actorHash);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${id}.${sign(id, masterKey, password)}`, {
    ...cookieOptions(),
    maxAge: VAULT_SESSION_SECONDS,
  });
}

export async function clearVaultSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    ...cookieOptions(),
    expires: new Date(0),
  });
}

/** The session id from a well-formed, correctly signed cookie, or null. Never throws. */
async function readSignedSessionId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  // Older cookies had three parts and no database row; they simply no longer count.
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [id, signature] = parts;
  if (!SESSION_ID_PATTERN.test(id)) return null;

  const { masterKey, password } = getVaultConfig();
  return safeEqual(signature, sign(id, masterKey, password)) ? id : null;
}

export type VaultSessionState =
  | Readonly<{ id: string; status: "active" }>
  | Readonly<{ status: "none" }>
  | Readonly<{ missingTable: boolean; status: "error" }>;

/**
 * Whether this browser holds an active session. A store failure is reported as "error", not
 * "none", so an outage is never mistaken for a signed-out browser. This never records
 * activity: page renders (including the automatic refresh as codes rotate) must not keep an
 * unattended tab alive.
 */
export async function getVaultSession(): Promise<VaultSessionState> {
  // Read the cookie before the clock: with Cache Components, touching the time before any
  // request data would make Next.js try to prerender the vault page.
  const id = await readSignedSessionId();
  if (!id) return { status: "none" };

  try {
    const row = await findVaultSession(id);
    return row && isVaultSessionActive(row, Date.now())
      ? { id, status: "active" }
      : { status: "none" };
  } catch (error) {
    return {
      missingTable: error instanceof VaultStoreError && error.missingTable,
      status: "error",
    };
  }
}

/** Signs this browser out: revokes its row (best effort) and removes the cookie. */
export async function endVaultSession(): Promise<void> {
  const id = await readSignedSessionId();
  if (id) {
    try {
      await revokeVaultSession(id);
    } catch (error) {
      console.error(
        "[vault] could not revoke the session row:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  await clearVaultSessionCookie();
}
