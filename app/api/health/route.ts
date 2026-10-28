import { query } from "@/lib/db";
import { json } from "@/lib/security";

export async function GET() {
  try {
    await query("select 1");
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
