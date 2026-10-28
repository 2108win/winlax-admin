import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { getApp } from "@/lib/server/apps";
import { isJobAction, startJob } from "@/lib/server/jobs";

export async function POST(request: Request, { params }: { params: Promise<{ app: string }> }) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const app = await getApp((await params).app);
  if (!app) return json({ error: "Không có web này." }, 404);

  const { action } = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (!isJobAction(action)) return json({ error: "Thao tác không hợp lệ." }, 400);

  const job = await startJob(app.name, action, session.email);
  await audit({ email: session.email, ip: clientIp(request), action: `app.${action}`, target: app.name, detail: { job: job.id } });
  return json({ job: job.id });
}
