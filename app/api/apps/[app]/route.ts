import { requireApiSession } from "@/lib/auth";
import { json } from "@/lib/security";
import { activePort, currentRelease, getApp, pm2Processes, processesOf } from "@/lib/server/apps";
import { deployRuns, logFiles } from "@/lib/server/history";

export async function GET(request: Request, { params }: { params: Promise<{ app: string }> }) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const app = await getApp((await params).app);
  if (!app) return json({ error: "Không có web này." }, 404);

  const [port, release, processes, runs, logs] = await Promise.all([
    activePort(app),
    currentRelease(app.name),
    pm2Processes(),
    deployRuns(200),
    logFiles(app.name),
  ]);
  return json({
    ...app,
    activePort: port,
    release,
    processes: processesOf(app.name, processes),
    runs: runs.filter((run) => run.app === app.name).slice(0, 30),
    logFiles: logs.slice(0, 30),
  });
}
