import { audit } from "@/lib/audit";
import { forgetTrustedDevices, requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Forgets one remembered device ({ id }) or all of them ({ all: true }); those devices
 * need the 2FA code again at their next login. Only takes access away, so no step-up.
 */
export async function DELETE(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown; all?: unknown };
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null;
  if (!id && body.all !== true) return json({ error: "Thiếu thiết bị cần quên." }, 400);

  const forgotten = await forgetTrustedDevices(session.email, id);
  await audit({
    email: session.email,
    ip: clientIp(request),
    action: "device.forgotten",
    target: id ?? "all",
    detail: { count: forgotten },
  });
  return json({ ok: true, forgotten });
}
