import "server-only";

import { Pool, types } from "pg";

import { DbExecutionError, type QueryExecutor, type QuerySpec } from "@/lib/vault/db/query";

// Return what PostgREST used to: timestamps as ISO strings, bigint (TOTP steps) as numbers.
// Postgres prints "2026-10-28 10:00:00.123+00"; JavaScript needs "T" and "+00:00".
const toIso = (value: string) => {
  const date = new Date(value.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};
types.setTypeParser(1184, toIso); // timestamptz
types.setTypeParser(1114, (value) => toIso(`${value}Z`)); // timestamp
types.setTypeParser(20, (value) => Number(value)); // int8

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function ident(name: string) {
  const trimmed = name.trim();
  if (!IDENTIFIER.test(trimmed)) throw new DbExecutionError(`Tên cột/bảng không hợp lệ: ${name}`, 400);
  return `"${trimmed}"`;
}

function columnList(columns: string) {
  return columns.trim() === "*" ? "*" : columns.split(",").map(ident).join(", ");
}

// jsonb values (security event meta) travel as JSON text; Postgres casts them on write.
function toParam(value: unknown) {
  return value !== null && typeof value === "object" && !(value instanceof Date)
    ? JSON.stringify(value)
    : value;
}

const COMPARISON = { eq: "=", gt: ">", gte: ">=", lt: "<", lte: "<=", neq: "<>" } as const;

export function buildSql(spec: QuerySpec): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const param = (value: unknown) => {
    values.push(toParam(value));
    return `$${values.length}`;
  };
  const table = ident(spec.table);
  const where = spec.filters.map(({ column, operator, value }) => {
    if (operator === "is") return `${ident(column)} is ${value === null ? "null" : value ? "true" : "false"}`;
    if (operator === "eq" && value === null) return `${ident(column)} is null`;
    return `${ident(column)} ${COMPARISON[operator]} ${param(value)}`;
  });
  const whereSql = where.length ? ` where ${where.join(" and ")}` : "";
  const returning = spec.columns === null ? "" : ` returning ${columnList(spec.columns)}`;

  switch (spec.action) {
    case "select": {
      const order = spec.order.length
        ? ` order by ${spec.order.map((item) => `${ident(item.column)} ${item.ascending ? "asc" : "desc"}`).join(", ")}`
        : "";
      const limit = spec.limit === null ? "" : ` limit ${Math.max(0, Math.trunc(spec.limit))}`;
      const columns = spec.head ? "1" : columnList(spec.columns ?? "*");
      return { text: `select ${columns} from ${table}${whereSql}${order}${limit}`, values };
    }
    case "delete":
      return { text: `delete from ${table}${whereSql}${returning}`, values };
    case "update": {
      const sets = Object.entries(spec.values[0] ?? {})
        .filter(([, value]) => value !== undefined)
        .map(([column, value]) => `${ident(column)} = ${param(value)}`);
      return { text: `update ${table} set ${sets.join(", ")}${whereSql}${returning}`, values };
    }
    case "insert": {
      const columns = [...new Set(spec.values.flatMap((row) => Object.keys(row).filter((key) => row[key] !== undefined)))];
      const rows = spec.values.map(
        (row) => `(${columns.map((column) => (row[column] === undefined ? "default" : param(row[column]))).join(", ")})`,
      );
      return { text: `insert into ${table} (${columns.map(ident).join(", ")}) values ${rows.join(", ")}${returning}`, values };
    }
  }
}

const globalForPool = globalThis as typeof globalThis & { __winlaxPools?: Map<string, Pool> };

function getPool(connectionString: string, timeoutMs: number) {
  globalForPool.__winlaxPools ??= new Map();
  let pool = globalForPool.__winlaxPools.get(connectionString);
  if (!pool) {
    pool = new Pool({ connectionString, connectionTimeoutMillis: timeoutMs, max: 5, query_timeout: timeoutMs });
    globalForPool.__winlaxPools.set(connectionString, pool);
  }
  return pool;
}

export function createPostgresExecutor(connectionString: string, timeoutMs: number): QueryExecutor {
  return async (spec) => {
    const { text, values } = buildSql(spec);
    try {
      const result = await getPool(connectionString, timeoutMs).query(text, values);
      return { count: spec.count ? (result.rowCount ?? 0) : null, rows: result.rows };
    } catch (error) {
      const { code, message } = error as { code?: string; message: string };
      throw new DbExecutionError(message, code === "42P01" ? 404 : 500, code);
    }
  };
}
