"use client";

import { useState } from "react";

export function TotpForm({
  endpoint,
  redirectTo,
  onDone,
  offerRemember = false,
}: {
  endpoint: string;
  redirectTo?: string;
  onDone?: () => void;
  /** Login only: ask whether to remember this device so the next login skips 2FA. */
  offerRemember?: boolean;
}) {
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(offerRemember ? { code, remember } : { code }),
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
        className="input input-lg w-full text-center font-mono tracking-[0.4em]"
      />
      {offerRemember && (
        <label className="flex cursor-pointer items-start gap-2 text-sm text-base-content/70">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="checkbox checkbox-sm mt-0.5"
          />
          <span>
            Ghi nhớ máy này: lần sau đăng nhập trên máy này không cần mã 2FA. Đừng chọn nếu đây là máy dùng chung.
          </span>
        </label>
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      <button
        disabled={busy || code.length !== 6}
        className="w-full btn btn-primary"
      >
        {busy ? "Đang kiểm tra…" : "Xác nhận"}
      </button>
    </form>
  );
}
