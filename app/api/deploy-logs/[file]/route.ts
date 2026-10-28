import { readFile } from "node:fs/promises";

import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { DEPLOY_LOG_DIR } from "@/lib/server/apps";
import { LOG_FILE_PATTERN } from "@/lib/server/history";

export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const { file } = await params;
  if (!LOG_FILE_PATTERN.test(file)) return json({ error: "Tên file không hợp lệ." }, 400);
  const text = await readFile(`${DEPLOY_LOG_DIR}/${file}`, "utf8").catch(() => null);
  if (text === null) return json({ error: "Không có file log này." }, 404);
  return new Response(text, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
