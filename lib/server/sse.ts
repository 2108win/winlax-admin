import { spawn } from "node:child_process";

const HEARTBEAT_MS = 15_000;

/**
 * Streams `tail -F` of the given files as Server-Sent Events, one JSON string
 * per line. Ends with an "end" event when a line starts with `stopMarker`.
 */
export function tailResponse(
  files: string[],
  signal: AbortSignal,
  options: { lines?: number; stopMarker?: string } = {},
): Response {
  const encoder = new TextEncoder();
  const child = spawn("tail", ["-n", String(options.lines ?? 200), "-F", "--", ...files], {
    stdio: ["ignore", "pipe", "ignore"],
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let buffer = "";
      let closed = false;
      const send = (chunk: string) => {
        if (!closed) controller.enqueue(encoder.encode(chunk));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        child.kill();
        controller.close();
      };
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      child.stdout.on("data", (data: Buffer) => {
        buffer += data.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          send(`data: ${JSON.stringify(line)}\n\n`);
          if (options.stopMarker && line.startsWith(options.stopMarker)) {
            send(`event: end\ndata: ${JSON.stringify(line)}\n\n`);
            close();
            return;
          }
        }
      });
      child.on("exit", close);
      signal.addEventListener("abort", close);
    },
    cancel() {
      child.kill();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
