import { chmod, copyFile, readFile, rename, writeFile } from "node:fs/promises";

export function envPath(app: string): string {
  return `/var/www/${app}/shared/.env.production.local`;
}

export async function readEnv(app: string): Promise<string> {
  return readFile(envPath(app), "utf8").catch(() => "");
}

/** Keeps the previous file as .bak-<time>, then swaps the new one in atomically. */
export async function writeEnv(app: string, content: string): Promise<string> {
  const path = envPath(app);
  const backup = `${path}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await copyFile(path, backup).catch(() => undefined);
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  return backup;
}

/** Names only, for the audit log (never values). */
export function envKeys(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
    .filter((key): key is string => Boolean(key));
}
