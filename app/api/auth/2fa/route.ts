import { audit } from "@/lib/audit";
import {
  consumeTotp,
  createSession,
  finishPendingLogin,
  getPendingLogin,
  getTotpSecret,
  isRateLimited,
  recordFailure,
  saveTotpSecret,
} from "@/lib/auth";
import { clientIp, isSameOrigin, json } from "@/lib/security";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  const pending = await getPendingLogin();
  if (!pending) return json({ error: "Phiên đăng nhập đã hết hạn, hãy đăng nhập Google lại." }, 401);
  if (await isRateLimited(request)) {
    return json({ error: "Sai mã quá nhiều lần. Thử lại sau 15 phút." }, 429);
  }

  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  const enrolled = await getTotpSecret();
  const secret = enrolled ?? pending.enrollSecret;
  if (!secret || !code || !(await consumeTotp(secret, code))) {
    await recordFailure(request, "totp");
    await audit({ email: pending.email, ip: clientIp(request), action: "login.totp_failed" });
    return json({ error: "Mã không đúng hoặc đã dùng rồi." }, 400);
  }

  if (!enrolled) {
    await saveTotpSecret(secret);
    await audit({ email: pending.email, ip: clientIp(request), action: "totp.enrolled" });
  }
  await finishPendingLogin(pending);
  await createSession(pending.email, request);
  await audit({ email: pending.email, ip: clientIp(request), action: "login" });
  return json({ ok: true });
}
