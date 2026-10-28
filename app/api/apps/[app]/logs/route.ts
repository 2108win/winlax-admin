import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { activePort, getApp, pm2Processes, processesOf } from "@/lib/server/apps";
import { tailResponse } from "@/lib/server/sse";

/** Live stdout + stderr of the process nginx currently serves. */
export async function GET(request: Request, { params }: { params: Promise<{ app: string }> }) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const app = await getApp((await params).app);
  if (!app) return json({ error: "Không có web này." }, 404);

  const port = await activePort(app);
  const processes = processesOf(app.name, await pm2Processes());
  const proc = processes.find((p) => p.name.endsWith(`-${port}`)) ?? processes[0];
  if (!proc) return json({ error: "App không chạy." }, 404);
  return tailResponse([proc.outLog, proc.errLog].filter(Boolean), request.signal, { lines: 200 });
}
