"use client";

import "@xterm/xterm/css/xterm.css";

import { useEffect, useRef, useState } from "react";

import { useStepUpFetch } from "@/components/step-up";

export function WebTerminal() {
  const fetchWithStepUp = useStepUpFetch();
  const container = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!started || !container.current) return;
    const host = container.current;
    let disposed = false;
    let id: string | null = null;
    let source: EventSource | null = null;
    let pending = "";
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanups: Array<() => void> = [];

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
      if (disposed) return;
      const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        theme: { background: "#0b0d12" },
        scrollback: 5000,
      });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      cleanups.push(() => term.dispose());

      const response = await fetchWithStepUp("/api/terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cols: term.cols, rows: term.rows }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (disposed) {
        if (body.id) fetch(`/api/terminal/${body.id}`, { method: "DELETE" });
        return;
      }
      if (!response.ok || !body.id) {
        setStatus(body.error ?? `Không mở được terminal (HTTP ${response.status})`);
        return;
      }
      id = body.id;
      setStatus("Đang kết nối (root@VPS)");

      const post = (payload: object) =>
        fetch(`/api/terminal/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

      source = new EventSource(`/api/terminal/${id}`);
      source.onmessage = (event) => term.write(JSON.parse(event.data) as string);
      source.addEventListener("exit", () => {
        term.write("\r\n\x1b[33m[Shell đã thoát. Tải lại trang để mở terminal mới.]\x1b[0m\r\n");
        setStatus("Đã thoát");
        source?.close();
      });
      source.onerror = () => setStatus("Mất kết nối, đang thử lại…");
      source.onopen = () => setStatus("root@VPS");

      const input = term.onData((data) => {
        pending += data;
        flushTimer ??= setTimeout(() => {
          const chunk = pending;
          pending = "";
          flushTimer = null;
          post({ input: chunk });
        }, 15);
      });
      cleanups.push(() => input.dispose());

      const onResize = () => {
        fit.fit();
        post({ cols: term.cols, rows: term.rows });
      };
      window.addEventListener("resize", onResize);
      cleanups.push(() => window.removeEventListener("resize", onResize));
      term.focus();
    })();

    return () => {
      disposed = true;
      source?.close();
      if (id) fetch(`/api/terminal/${id}`, { method: "DELETE", keepalive: true });
      for (const cleanup of cleanups.reverse()) cleanup();
    };
  }, [started, fetchWithStepUp]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Terminal</h1>
        <span className="text-xs text-white/40">{status}</span>
      </div>
      {!started ? (
        <div className="space-y-3 text-sm text-white/60">
          <p>Shell bash với quyền root trên VPS, giống SSH. Cần nhập lại mã 2FA. Đóng trang là đóng shell; để yên 30 phút cũng tự đóng.</p>
          <button onClick={() => setStarted(true)} className="rounded-lg bg-white px-3 py-1.5 text-sm text-black">
            Mở terminal
          </button>
        </div>
      ) : (
        <div ref={container} className="h-[70vh] overflow-hidden rounded-xl border border-white/10 bg-[#0b0d12] p-2" />
      )}
    </div>
  );
}
