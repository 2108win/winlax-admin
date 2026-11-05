import { audit } from "@/lib/audit";
import {
  checkPassword,
  getPasswordHash,
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
    return json({ error: "Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút." }, 429);
  }
  if ((await getPasswordHash()) === null) {
    // A session from before the password existed: logging in again sets it.
    return json({ error: "Chưa có mật khẩu. Đăng xuất rồi đăng nhập lại để đặt mật khẩu." }, 409);
  }
  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  if (!(await checkPassword(password))) {
    await recordFailure(request, "stepup");
    await audit({ email: session.email, ip: clientIp(request), action: "stepup.failed" });
    return json({ error: "Mật khẩu không đúng." }, 400);
  }
  await markStepUp(session);
  await audit({ email: session.email, ip: clientIp(request), action: "stepup" });
  return json({ ok: true });
}
