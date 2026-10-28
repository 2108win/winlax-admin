import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { listTerminals, openTerminal } from "@/lib/server/terminal";

export async function GET(request: Request) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  return json({ terminals: listTerminals() });
}

export async function POST(request: Request) {
  const session = await requireApiSession(request, { stepUp: true });
  if (session instanceof Response) return session;
  const { cols, rows } = (await request.json().catch(() => ({}))) as { cols?: number; rows?: number };
  try {
    const id = await openTerminal(session.email, Number(cols) || 100, Number(rows) || 30);
    await audit({ email: session.email, ip: clientIp(request), action: "terminal.open", target: id.slice(0, 8) });
    return json({ id });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
}
