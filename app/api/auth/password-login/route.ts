import { audit } from "@/lib/audit";
import {
  createPendingLogin,
  getPasswordHash,
  isRateLimited,
  recordFailure,
} from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { MAX_PASSWORD_LENGTH, verifyPassword } from "@/lib/password";
import { clientIp, isSameOrigin, json } from "@/lib/security";

/**
 * Email + password instead of Google. It only replaces the first step: on success the
 * browser goes on to /login/2fa exactly like after Google.
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

  await createPendingLogin(env.adminEmail);
  await audit({ email: env.adminEmail, ip, action: "login.password" });
  return json({ ok: true });
}
