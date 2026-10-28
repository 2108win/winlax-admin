import { audit } from "@/lib/audit";
import { destroySession, requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  await destroySession();
  await audit({ email: session.email, ip: clientIp(request), action: "logout" });
  return json({ ok: true });
}
