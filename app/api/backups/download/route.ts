import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { backupPath } from "@/lib/server/backups";

export async function GET(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const db = url.searchParams.get("db") ?? "";
  const file = url.searchParams.get("file") ?? "";
  const path = backupPath(db, file);
  if (!path) return json({ error: "Tên file không hợp lệ." }, 400);
  const info = await stat(path).catch(() => null);
  if (!info) return json({ error: "Không có file này." }, 404);
  await audit({ email: session.email, ip: clientIp(request), action: "backup.download", target: `${db}/${file}` });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
