import { execFile, spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

export const BACKUP_DIR = "/var/backups/postgres";
const DB_NAME = /^[a-z0-9_]+$/;
const DUMP_NAME = /^[a-z0-9_]+-\d{8}-\d{4}\.dump$/;

export function backupPath(db: string, file: string): string | null {
  return DB_NAME.test(db) && DUMP_NAME.test(file) && file.startsWith(`${db}-`) ? `${BACKUP_DIR}/${db}/${file}` : null;
}

export async function listBackups() {
  const dbs = (await readdir(BACKUP_DIR, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    dbs.map(async (db) => {
      const names = (await readdir(`${BACKUP_DIR}/${db}`)).filter((name) => DUMP_NAME.test(name)).sort().reverse();
      const files = await Promise.all(
        names.map(async (name) => {
          const info = await stat(`${BACKUP_DIR}/${db}/${name}`);
          return { name, size: info.size, at: info.mtime.toISOString() };
        }),
      );
      return { db, files };
    }),
  );
}

export async function runBackup(): Promise<string> {
  const { stdout, stderr } = await run("/opt/winlax-deploy/backup-postgres.sh", [], { timeout: 10 * 60_000 });
  return `${stdout}${stderr}`.trim();
}

/** pg_restore --clean into `db` from a dump in the backup folder, as the postgres user. */
export function restoreBackup(db: string, path: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("runuser", ["-u", "postgres", "--", "pg_restore", "--clean", "--if-exists", "--no-owner", "-d", db], {
      cwd: "/tmp",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    createReadStream(path).pipe(child.stdin);
    child.on("close", (code) => resolve({ code: code ?? 1, output: output.slice(-20_000) }));
  });
}
