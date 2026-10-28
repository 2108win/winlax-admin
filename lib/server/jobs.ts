import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promisify } from "node:util";

import { query } from "../db";
import { DEPLOY_LOG_DIR } from "./apps";

const run = promisify(execFile);

export const JOB_ACTIONS = {
  deploy: (app: string) => [app],
  restart: (app: string) => ["restart", app],
  rollback: (app: string) => ["rollback", app],
} as const;

export type JobAction = keyof typeof JOB_ACTIONS;

export function isJobAction(value: unknown): value is JobAction {
  return typeof value === "string" && value in JOB_ACTIONS;
}

export const EXIT_MARKER = "__EXIT__";

/**
 * Runs `deploy …` in its own systemd unit so it survives this app being
 * restarted or replaced by the very deploy it started (blue-green).
 */
export async function startJob(app: string, action: JobAction, email: string) {
  const id = `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = `${DEPLOY_LOG_DIR}/${app}-${stamp}.log`;
  await run("mkdir", ["-p", DEPLOY_LOG_DIR]);
  await query(
    "insert into admin_jobs (id, app, action, started_by, log_path) values ($1, $2, $3, $4, $5)",
    [id, app, action, email, logPath],
  );
  await run("systemd-run", [
    `--unit=winlax-job-${id}`,
    "--collect",
    "--quiet",
    "--setenv=HOME=/root",
    "--setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "--setenv=DEPLOY_SOURCE=admin",
    `--setenv=DEPLOY_BY=${email}`,
    `--setenv=DEPLOY_LOG_FILE=${logPath}`,
    "/bin/bash",
    "-c",
    `"$@" >"$DEPLOY_LOG_FILE" 2>&1; echo "${EXIT_MARKER} $?" >>"$DEPLOY_LOG_FILE"`,
    "winlax-job",
    "/usr/local/bin/deploy",
    ...JOB_ACTIONS[action](app),
  ]);
  return { id, logPath };
}

export async function getJob(id: string) {
  const rows = await query<{ id: string; app: string; action: string; log_path: string }>(
    "select id, app, action, log_path from admin_jobs where id = $1",
    [id],
  );
  return rows[0] ?? null;
}
