import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { backupPath, restoreBackup, runBackup } from "@/lib/server/backups";

export async function POST(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const { db, file, confirm } = (await request.json().catch(() => ({}))) as Record<string, string>;
  const path = backupPath(db ?? "", file ?? "");
  if (!path) return json({ error: "Tên file không hợp lệ." }, 400);
  if (confirm !== db) return json({ error: "Gõ đúng tên database để xác nhận." }, 400);

  // A fresh backup first, so the restore itself can be undone.
  await runBackup();
  const result = await restoreBackup(db, path);
  await audit({
    email: session.email,
    ip: clientIp(request),
    action: "backup.restore",
    target: `${db}/${file}`,
    detail: { exitCode: result.code },
  });
  return json({ ok: result.code === 0, ...result }, result.code === 0 ? 200 : 500);
}
