import { audit } from "@/lib/audit";
import {
  beginLogin,
  getPasswordHash,
  isRateLimited,
  recordFailure,
} from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { MAX_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import { clientIp, isSameOrigin, json } from "@/lib/security";

/**
 * Email + password instead of Google. It replaces the Google step: like after Google,
 * a remembered device signs in at once and any other device goes on to /login/2fa.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  if (await isRateLimited(request)) {
    return json({ error: "Sai quá nhiều lần. Thử lại sau 15 phút." }, 429);
  }

  const stored = await getPasswordHash();
  if (!stored) {
    return json(
      { error: "Chưa bật đăng nhập bằng mật khẩu. Đăng nhập Google rồi đặt mật khẩu ở mục Tài khoản." },
      409,
    );
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  // Check both every time so a wrong email takes as long as a wrong password.
  const passwordOk =
    password.length > 0 &&
    password.length <= MAX_PASSWORD_LENGTH &&
    (await verifyPassword(stored, password));
  const emailOk = safeEqual(email, env.adminEmail);
  const ip = clientIp(request);

  if (!emailOk || !passwordOk) {
    await recordFailure(request, "password");
    await audit({ email: email || null, ip, action: "login.password_failed" });
    return json({ error: "Email hoặc mật khẩu không đúng." }, 400);
  }

  const { deviceId, next } = await beginLogin(env.adminEmail, request);
  await audit({
    email: env.adminEmail,
    ip,
    action: deviceId ? "login" : "login.password",
    detail: deviceId ? { via: "password", device: deviceId } : undefined,
  });
  return json({ ok: true, next });
}
