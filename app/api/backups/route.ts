import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { listBackups, runBackup } from "@/lib/server/backups";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  return json({ databases: await listBackups() });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  try {
    const output = await runBackup();
    await audit({ email: session.email, ip: clientIp(request), action: "backup.run" });
    return json({ ok: true, output });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
