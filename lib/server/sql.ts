import type { QueryResult } from "pg";

import { query, withDatabase } from "../db";

const MAX_ROWS = 1000;

export async function listDatabases() {
  return query<{ name: string; size: string }>(
    "select datname as name, pg_database_size(datname)::text as size from pg_database where not datistemplate order by 1",
  );
}

export async function listTables(db: string) {
  return withDatabase(db, async (client) => {
    const result = await client.query<{ schema: string; name: string; rows: string; size: string }>(
      `select n.nspname as schema, c.relname as name,
              greatest(c.reltuples, 0)::bigint::text as rows,
              pg_total_relation_size(c.oid)::text as size
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r', 'p', 'v', 'm')
          and n.nspname not in ('pg_catalog', 'information_schema') and n.nspname not like 'pg_toast%'
        order by 1, 2`,
    );
    return result.rows;
  });
}

function cell(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `\\x${value.toString("hex").slice(0, 200)}`;
  if (typeof value === "bigint") return value.toString();
  return value;
}

export async function runSql(db: string, sql: string) {
  return withDatabase(db, async (client) => {
    await client.query("set statement_timeout = '30s'");
    const started = Date.now();
    const raw = (await client.query(sql)) as QueryResult | QueryResult[];
    const results = Array.isArray(raw) ? raw : [raw];
    const last = results[results.length - 1];
    return {
      command: last?.command ?? "",
      rowCount: last?.rowCount ?? 0,
      statements: results.length,
      fields: (last?.fields ?? []).map((field) => field.name),
      rows: (last?.rows ?? []).slice(0, MAX_ROWS).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, cell(value)]))),
      truncated: (last?.rows?.length ?? 0) > MAX_ROWS,
      ms: Date.now() - started,
    };
  });
}
