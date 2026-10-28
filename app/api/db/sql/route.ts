import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { listDatabases, runSql } from "@/lib/server/sql";

export async function POST(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const { db, sql } = (await request.json().catch(() => ({}))) as { db?: string; sql?: string };
  if (!db || !sql?.trim()) return json({ error: "Thiếu database hoặc câu SQL." }, 400);
  if (!(await listDatabases()).some((item) => item.name === db)) return json({ error: "Không có database này." }, 404);

  try {
    const result = await runSql(db, sql);
    await audit({ email: session.email, ip: clientIp(request), action: "sql", target: db, detail: { sql: sql.slice(0, 2000), command: result.command, rowCount: result.rowCount } });
    return json(result);
  } catch (error) {
    await audit({ email: session.email, ip: clientIp(request), action: "sql.error", target: db, detail: { sql: sql.slice(0, 2000) } });
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}
