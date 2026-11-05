import { audit } from "@/lib/audit";
import {
  checkPassword,
  createSession,
  finishPendingLogin,
  getPasswordHash,
  getPendingLogin,
  isRateLimited,
  recordFailure,
  savePasswordHash,
} from "@/lib/auth";
import { hashPassword, passwordProblem } from "@/lib/password";
import { clientIp, isSameOrigin, json } from "@/lib/security";

/** Second login step after Google: sets the admin password the first time, checks it after that. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
  const pending = await getPendingLogin();
  if (!pending) return json({ error: "Phiên đăng nhập đã hết hạn, hãy đăng nhập Google lại." }, 401);
  if (await isRateLimited(request)) {
    return json({ error: "Sai mật khẩu quá nhiều lần. Thử lại sau 15 phút." }, 429);
  }

  const body = (await request.json().catch(() => ({}))) as { password?: unknown; confirm?: unknown };
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";
  const ip = clientIp(request);

  if ((await getPasswordHash()) === null) {
    const problem = passwordProblem(password, confirm);
    if (problem) return json({ error: problem }, 400);
    if (await savePasswordHash(await hashPassword(password))) {
      await audit({ email: pending.email, ip, action: "password.created" });
    } else if (!(await checkPassword(password))) {
      // Set by another tab a moment ago: this one must match it like a normal login.
      return json({ error: "Mật khẩu vừa được đặt ở nơi khác. Hãy nhập mật khẩu đó." }, 409);
    }
  } else if (!(await checkPassword(password))) {
    await recordFailure(request, "password");
    await audit({ email: pending.email, ip, action: "login.password_failed" });
    return json({ error: "Mật khẩu không đúng." }, 400);
  }

  await finishPendingLogin(pending);
  await createSession(pending.email, request);
  await audit({ email: pending.email, ip, action: "login" });
  return json({ ok: true });
}
