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
    <section className="rounded-xl border border-base-300 bg-base-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs uppercase tracking-wide text-base-content/40">Biến môi trường</h2>
        {content === null ? (
          <button onClick={open} className="ml-auto btn btn-outline btn-sm">
            Mở để xem / sửa
          </button>
        ) : (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setContent(null)} className="btn btn-ghost btn-sm">
              Đóng
            </button>
            <button disabled={busy} onClick={save} className="btn btn-primary btn-sm">
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
          className="log-view mt-3 h-80 w-full rounded-lg border border-base-300 bg-base-300 p-3 outline-none focus:border-primary"
        />
      )}
      {message && <p className="mt-2 text-sm text-base-content/70">{message}</p>}
    </section>
  );
}
