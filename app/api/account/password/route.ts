import { audit } from "@/lib/audit";
import { clearPasswordHash, requireApiSession, setPasswordHash } from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";
import { clientIp, json } from "@/lib/security";

/** Sets or changes the login password. Needs a fresh 2FA code like other dangerous actions. */
export async function PUT(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const body = (await request.json().catch(() => ({}))) as { password?: unknown; confirm?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const problem = passwordProblem(password, confirm);
  if (problem) return json({ error: problem }, 400);

  await setPasswordHash(await hashPassword(password));
  await audit({ email: session.email, ip: clientIp(request), action: "password.set" });
  return json({ ok: true });
}

/** Turns password login off; Google stays the only way in. */
export async function DELETE(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  await clearPasswordHash();
  await audit({ email: session.email, ip: clientIp(request), action: "password.removed" });
  return json({ ok: true });
}
