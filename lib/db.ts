import { Pool, type PoolClient } from "pg";

const globalForDb = globalThis as unknown as {
  adminPool?: Pool;
  adminSchema?: Promise<void>;
};

function pool(): Pool {
  globalForDb.adminPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
  return globalForDb.adminPool;
}

const SCHEMA = `
create table if not exists admin_sessions (
  token_hash text primary key,
  email text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  stepup_at timestamptz,
  ip text,
  user_agent text
);
create table if not exists admin_pending_logins (
  token_hash text primary key,
  email text not null,
  enroll_secret text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
create table if not exists admin_auth_failures (
  id bigserial primary key,
  ip text not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists admin_auth_failures_at on admin_auth_failures (at);
create table if not exists admin_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text,
  ip text,
  action text not null,
  target text,
  detail jsonb
);
create index if not exists admin_audit_at on admin_audit (at desc);
create table if not exists admin_jobs (
  id text primary key,
  app text not null,
  action text not null,
  started_by text,
  started_at timestamptz not null default now(),
  log_path text not null
);
`;

function ensureSchema(): Promise<void> {
  globalForDb.adminSchema ??= pool()
    .query(SCHEMA)
    .then(() => undefined)
    .catch((error) => {
      globalForDb.adminSchema = undefined;
      throw error;
    });
  return globalForDb.adminSchema;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  await ensureSchema();
  const result = await pool().query(text, params);
  return result.rows as T[];
}

/** A client on any database of this server, for the SQL console and DB views. */
export async function withDatabase<T>(
  database: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${database}`;
  const scoped = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await scoped.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    await scoped.end();
  }
}
