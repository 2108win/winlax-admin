import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { listDatabases, listTables } from "@/lib/server/sql";

export async function GET(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const db = new URL(request.url).searchParams.get("db");
  const databases = await listDatabases();
  if (db && !databases.some((item) => item.name === db)) return json({ error: "Không có database này." }, 404);
  return json({
    databases: databases.map((item) => ({ name: item.name, size: Number(item.size) })),
    tables: db ? await listTables(db) : [],
  });
}
