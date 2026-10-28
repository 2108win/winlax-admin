"use client";

import { useState } from "react";

export function TotpForm({
  endpoint,
  redirectTo,
  onDone,
}: {
  endpoint: string;
  redirectTo?: string;
  onDone?: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Không xác minh được mã.");
      setCode("");
      return;
    }
    if (redirectTo) window.location.assign(redirectTo);
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <input
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        placeholder="6 số"
        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-white/40"
      />
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button
        disabled={busy || code.length !== 6}
        className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-40"
      >
        {busy ? "Đang kiểm tra…" : "Xác nhận"}
      </button>
    </form>
  );
}
