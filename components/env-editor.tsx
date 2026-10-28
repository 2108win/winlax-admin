"use client";

import { useState } from "react";

import { useStepUpFetch } from "@/components/step-up";

export function EnvEditor({ app }: { app: string }) {
  const fetchWithStepUp = useStepUpFetch();
  const [content, setContent] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setMessage(null);
    const response = await fetchWithStepUp(`/api/apps/${app}/env`);
    const body = (await response.json().catch(() => ({}))) as { content?: string; error?: string };
    if (!response.ok) return setMessage(body.error ?? `Lỗi HTTP ${response.status}`);
    setContent(body.content ?? "");
  }

  async function save() {
    if (content === null || !window.confirm(`Ghi đè file biến môi trường của ${app}? Bản cũ được giữ lại (.bak).`)) return;
    setBusy(true);
    const response = await fetchWithStepUp(`/api/apps/${app}/env`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    setMessage(
      response.ok
        ? "Đã lưu. Biến NEXT_PUBLIC_* cần bấm Deploy; biến khác chỉ cần Khởi động lại."
        : (body.error ?? `Lỗi HTTP ${response.status}`),
    );
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs uppercase tracking-wide text-white/40">Biến môi trường</h2>
        {content === null ? (
          <button onClick={open} className="ml-auto rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/10">
            Mở để xem / sửa
          </button>
        ) : (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setContent(null)} className="rounded-lg px-3 py-1 text-sm text-white/50 hover:text-white">
              Đóng
            </button>
            <button disabled={busy} onClick={save} className="rounded-lg bg-white px-3 py-1 text-sm text-black disabled:opacity-40">
              {busy ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        )}
      </div>
      {content !== null && (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          spellCheck={false}
          className="log-view mt-3 h-80 w-full rounded-lg border border-white/10 bg-black/50 p-3 outline-none focus:border-white/30"
        />
      )}
      {message && <p className="mt-2 text-sm text-white/70">{message}</p>}
    </section>
  );
}
