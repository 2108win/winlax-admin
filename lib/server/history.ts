import { readdir, readFile } from "node:fs/promises";

import { DEPLOY_LOG_DIR } from "./apps";

export type DeployEvent = {
  ts: string;
  run: string;
  app: string;
  action: string;
  status: "start" | "ok" | "fail";
  source?: string;
  by?: string;
  commit?: string;
  log?: string;
  seconds?: number;
};

export type DeployRun = {
  run: string;
  app: string;
  action: string;
  source: string;
  by?: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "ok" | "fail";
  commit?: string;
  log?: string;
  seconds?: number;
};

/** Runs recorded by the deploy script in events.jsonl, newest first. */
export async function deployRuns(limit = 100): Promise<DeployRun[]> {
  const text = await readFile(`${DEPLOY_LOG_DIR}/events.jsonl`, "utf8").catch(() => "");
  const runs = new Map<string, DeployRun>();
  for (const line of text.trim().split("\n").slice(-2000)) {
    let event: DeployEvent;
    try {
      event = JSON.parse(line) as DeployEvent;
    } catch {
      continue;
    }
    const existing = runs.get(event.run);
    if (event.status === "start" || !existing) {
      runs.set(event.run, {
        run: event.run,
        app: event.app,
        action: event.action,
        source: event.source ?? "ssh",
        by: event.by,
        startedAt: event.ts,
        status: event.status === "start" ? "running" : event.status,
        commit: event.commit,
        log: event.log,
      });
    }
    const current = runs.get(event.run)!;
    if (event.status !== "start") {
      current.status = event.status;
      current.finishedAt = event.ts;
      current.commit = event.commit ?? current.commit;
      current.seconds = event.seconds;
    }
  }
  return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

export const LOG_FILE_PATTERN = /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}T[\dZ-]+\.log$/;

export async function logFiles(app?: string): Promise<string[]> {
  const files = await readdir(DEPLOY_LOG_DIR).catch(() => []);
  return files
    .filter((file) => LOG_FILE_PATTERN.test(file) && (!app || file.startsWith(`${app}-`)))
    .sort()
    .reverse();
}
