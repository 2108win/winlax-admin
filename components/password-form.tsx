"use client";

import { useState } from "react";

/**
 * Asks for the admin password. With `minLength` (from the server's rule), asks for a new
 * password twice to set it the first time. `email` fills a hidden username field so password
 * managers save the right account.
 */
export function PasswordForm({
  endpoint,
  redirectTo,
  onDone,
  minLength,
  email,
}: {
  endpoint: string;
  redirectTo?: string;
  onDone?: () => void;
  minLength?: number;
  email?: string;
}) {
  const create = minLength !== undefined;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (create && password !== confirm) {
      setError("Hai lần nhập mật khẩu không khớp.");
      return;
    }
    setBusy(true);
    setError(null);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(create ? { password, confirm } : { password }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setError(body.error ?? "Không xác minh được mật khẩu.");
      if (!create) setPassword("");
      return;
    }
    if (redirectTo) window.location.assign(redirectTo);
    onDone?.();
  }

  const ready = create ? password.length >= minLength && confirm.length > 0 : password.length > 0;

  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      {email && (
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      )}
      <input
        type="password"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete={create ? "new-password" : "current-password"}
        autoFocus
        placeholder={create ? `Mật khẩu mới (ít nhất ${minLength} ký tự)` : "Mật khẩu"}
        className="input input-lg w-full"
      />
      {create && (
        <input
          type="password"
          name="confirm"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
          className="input input-lg w-full"
        />
      )}
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={busy || !ready} className="w-full btn btn-primary">
        {busy ? "Đang kiểm tra…" : create ? "Đặt mật khẩu và vào" : "Xác nhận"}
      </button>
    </form>
  );
}
