import "server-only";

import { createPostgresExecutor } from "@/lib/vault/db/postgres";
import { Query, type QueryExecutor } from "@/lib/vault/db/query";

/** Every query fails fast instead of leaving the UI on a spinner. */
export const DB_TIMEOUT_MS = 5_000;

export function readFirstEnvironmentValue(
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** The winlax_v2 database (the vault tables live there), as its own least-privilege role. */
export function readDatabaseUrl(): string | null {
  return readFirstEnvironmentValue(["VAULT_DATABASE_URL"]) ?? null;
}

export function isDatabaseConfigured(): boolean {
  return readDatabaseUrl() !== null;
}

// Tests register in-memory tables under a memory:// URL (see src/test/mock-database.ts).
const globalForExecutors = globalThis as typeof globalThis & {
  __winlaxMemoryExecutors?: Map<string, QueryExecutor>;
};

export function registerMemoryDatabase(url: string, executor: QueryExecutor) {
  globalForExecutors.__winlaxMemoryExecutors ??= new Map();
  globalForExecutors.__winlaxMemoryExecutors.set(url, executor);
}

export type DbClient = Readonly<{ from: (table: string) => Query }>;

/** Server-only database client. Never import this from a Client Component. */
export function createDbClient(url: string | null = readDatabaseUrl()): DbClient {
  if (!url) throw new Error("Database vault chưa được cấu hình (VAULT_DATABASE_URL).");
  const executor = url.startsWith("memory://")
    ? globalForExecutors.__winlaxMemoryExecutors?.get(url)
    : createPostgresExecutor(url, DB_TIMEOUT_MS);
  if (!executor) throw new Error(`Không tìm thấy database ${url}.`);
  return { from: (table) => new Query(table, executor, DB_TIMEOUT_MS) };
}
