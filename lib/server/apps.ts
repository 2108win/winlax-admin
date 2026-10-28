import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

export const DEPLOY_DIR = "/opt/winlax-deploy";
export const DEPLOY_LOG_DIR = "/var/log/winlax-deploy";

export type AppConfig = {
  name: string;
  repo: string;
  branch: string;
  port: number;
  domains: string[];
  health: string;
};

export async function listApps(): Promise<AppConfig[]> {
  const text = await readFile(`${DEPLOY_DIR}/apps.conf`, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(/\s+/))
    .filter((cols) => cols.length >= 7)
    .map(([name, repo, branch, port, domains, , health]) => ({
      name,
      repo,
      branch,
      port: Number(port),
      domains: domains.split(","),
      health,
    }));
}

export async function getApp(name: string): Promise<AppConfig | null> {
  return (await listApps()).find((app) => app.name === name) ?? null;
}

/** The port nginx currently sends traffic to (blue-green: PORT or PORT+100). */
export async function activePort(app: AppConfig): Promise<number> {
  try {
    const text = await readFile(`/etc/nginx/winlax-upstreams/${app.name}.conf`, "utf8");
    const match = text.match(/127\.0\.0\.1:(\d+)/);
    if (match) return Number(match[1]);
  } catch {}
  return app.port;
}

export type Release = { dir: string; commit: string; subject: string; date: string } | null;

export async function currentRelease(app: string): Promise<Release> {
  try {
    const dir = await realpath(`/var/www/${app}/current`);
    const { stdout } = await run("git", ["-C", dir, "log", "-1", "--format=%h%x1f%s%x1f%cI"]);
    const [commit, subject, date] = stdout.trim().split("\x1f");
    return { dir, commit, subject, date };
  } catch {
    return null;
  }
}

export type Pm2Process = {
  name: string;
  status: string;
  cpu: number;
  memory: number;
  uptimeSince: number | null;
  restarts: number;
  cwd: string;
  outLog: string;
  errLog: string;
};

export async function pm2Processes(): Promise<Pm2Process[]> {
  const { stdout } = await run("pm2", ["jlist"], { maxBuffer: 32 * 1024 * 1024 });
  const list = JSON.parse(stdout.slice(stdout.indexOf("["))) as Array<{
    name: string;
    monit?: { cpu?: number; memory?: number };
    pm2_env?: {
      status?: string;
      pm_uptime?: number;
      restart_time?: number;
      pm_cwd?: string;
      pm_out_log_path?: string;
      pm_err_log_path?: string;
    };
  }>;
  return list.map((proc) => ({
    name: proc.name,
    status: proc.pm2_env?.status ?? "unknown",
    cpu: proc.monit?.cpu ?? 0,
    memory: proc.monit?.memory ?? 0,
    uptimeSince: proc.pm2_env?.status === "online" ? (proc.pm2_env.pm_uptime ?? null) : null,
    restarts: proc.pm2_env?.restart_time ?? 0,
    cwd: proc.pm2_env?.pm_cwd ?? "",
    outLog: proc.pm2_env?.pm_out_log_path ?? "",
    errLog: proc.pm2_env?.pm_err_log_path ?? "",
  }));
}

/** pm2 names an app "<app>-<port>" since blue-green deploys (older: "<app>"). */
export function processesOf(app: string, all: Pm2Process[]): Pm2Process[] {
  return all.filter(
    (proc) =>
      proc.name === app ||
      (proc.name.startsWith(`${app}-`) && /^\d+$/.test(proc.name.slice(app.length + 1))),
  );
}
