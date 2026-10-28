import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { getApp } from "@/lib/server/apps";
import { envKeys, readEnv, writeEnv } from "@/lib/server/env-file";

type Params = { params: Promise<{ app: string }> };

export async function GET(request: Request, { params }: Params) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const app = await getApp((await params).app);
  if (!app) return json({ error: "Không có web này." }, 404);
  await audit({ email: session.email, ip: clientIp(request), action: "env.read", target: app.name });
  return json({ content: await readEnv(app.name) });
}

export async function PUT(request: Request, { params }: Params) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const app = await getApp((await params).app);
  if (!app) return json({ error: "Không có web này." }, 404);
  const { content } = (await request.json().catch(() => ({}))) as { content?: unknown };
  if (typeof content !== "string" || content.length > 200_000) return json({ error: "Nội dung không hợp lệ." }, 400);

  const before = envKeys(await readEnv(app.name));
  const backup = await writeEnv(app.name, content);
  const after = envKeys(content);
  await audit({
    email: session.email,
    ip: clientIp(request),
    action: "env.write",
    target: app.name,
    detail: {
      added: after.filter((key) => !before.includes(key)),
      removed: before.filter((key) => !after.includes(key)),
      backup,
    },
  });
  return json({ ok: true, backup });
}
