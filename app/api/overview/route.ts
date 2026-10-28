import { requireApiSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { json } from "@/lib/security";
import { activePort, currentRelease, listApps, pm2Processes, processesOf } from "@/lib/server/apps";
import { deployRuns } from "@/lib/server/history";
import { certificates, latestBackups, systemMetrics } from "@/lib/server/metrics";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;

  const [system, apps, processes, databases, certs, backups, runs] = await Promise.all([
    systemMetrics(),
    listApps(),
    pm2Processes(),
    query<{ name: string; size: string }>(
      "select datname as name, pg_database_size(datname)::text as size from pg_database where not datistemplate order by 1",
    ),
    certificates(),
    latestBackups(),
    deployRuns(10),
  ]);

  const appStatus = await Promise.all(
    apps.map(async (app) => {
      const port = await activePort(app);
      const proc = processesOf(app.name, processes).find((p) => p.name.endsWith(`-${port}`)) ??
        processesOf(app.name, processes)[0];
      return { ...app, activePort: port, release: await currentRelease(app.name), process: proc ?? null };
    }),
  );
  const managed = new Set(appStatus.flatMap((app) => processesOf(app.name, processes).map((p) => p.name)));

  return json({
    system,
    apps: appStatus,
    otherProcesses: processes.filter((proc) => !managed.has(proc.name)),
    databases: databases.map((db) => ({ name: db.name, size: Number(db.size) })),
    certificates: certs,
    backups,
    runs,
  });
}
