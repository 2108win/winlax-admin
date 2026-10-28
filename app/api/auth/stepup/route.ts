import { audit } from "@/lib/audit";
import {
  consumeTotp,
  getTotpSecret,
  isRateLimited,
  markStepUp,
  recordFailure,
  requireApiSession,
} from "@/lib/auth";
import { clientIp, json } from "@/lib/security";

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  if (await isRateLimited(request)) {
    return json({ error: "Sai mã quá nhiều lần. Thử lại sau 15 phút." }, 429);
  }
  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  const secret = await getTotpSecret();
  if (!secret || !code || !(await consumeTotp(secret, code))) {
    await recordFailure(request, "stepup");
    await audit({ email: session.email, ip: clientIp(request), action: "stepup.failed" });
    return json({ error: "Mã không đúng hoặc đã dùng rồi." }, 400);
  }
  await markStepUp(session);
  await audit({ email: session.email, ip: clientIp(request), action: "stepup" });
  return json({ ok: true });
}
