import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { clientIp, json } from "@/lib/security";
import { closeTerminal, getTerminal, resizeTerminal, writeTerminal } from "@/lib/server/terminal";

type Params = { params: Promise<{ id: string }> };

/** Output as Server-Sent Events: the scrollback first, then live data. */
export async function GET(request: Request, { params }: Params) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const terminal = getTerminal((await params).id);
  if (!terminal) return json({ error: "Terminal đã đóng." }, 404);

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const listener = (event: { data?: string; exit?: number }) => {
        if (event.data !== undefined) send(`data: ${JSON.stringify(event.data)}\n\n`);
        if (event.exit !== undefined) {
          send(`event: exit\ndata: ${event.exit}\n\n`);
          cleanup();
        }
      };
      const heartbeat = setInterval(() => send(": ping\n\n"), 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        terminal.listeners.delete(listener);
        controller.close();
      };
      if (terminal.buffer) send(`data: ${JSON.stringify(terminal.buffer)}\n\n`);
      if (terminal.exited) return listener({ exit: 0 });
      terminal.listeners.add(listener);
      request.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

export async function POST(request: Request, { params }: Params) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const id = (await params).id;
  const body = (await request.json().catch(() => ({}))) as { input?: string; cols?: number; rows?: number };
  const ok =
    typeof body.input === "string"
      ? writeTerminal(id, body.input.slice(0, 100_000))
      : resizeTerminal(id, Number(body.cols), Number(body.rows));
  return ok ? json({ ok: true }) : json({ error: "Terminal đã đóng." }, 404);
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await requireApiSession(request);
  if (session instanceof Response) return session;
  const id = (await params).id;
  const closed = closeTerminal(id);
  if (closed) await audit({ email: session.email, ip: clientIp(request), action: "terminal.close", target: id.slice(0, 8) });
  return json({ ok: closed });
}
