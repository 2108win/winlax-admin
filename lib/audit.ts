import { query } from "./db";

export async function audit(
  entry: {
    email?: string | null;
    ip?: string | null;
    action: string;
    target?: string | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await query(
    "insert into admin_audit (email, ip, action, target, detail) values ($1, $2, $3, $4, $5)",
    [
      entry.email ?? null,
      entry.ip ?? null,
      entry.action,
      entry.target ?? null,
      entry.detail ? JSON.stringify(entry.detail) : null,
    ],
  );
}
