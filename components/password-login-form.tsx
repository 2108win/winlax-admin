"use client";

import { useState } from "react";

/** Email + password as the first login step; 2FA still follows on /login/2fa. */
export function PasswordLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch("/api/auth/password-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setBusy(false);
      setPassword("");
      setError(body.error ?? "Không đăng nhập được.");
      return;
    }
    window.location.assign("/login/2fa");
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="email"
        name="username"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        autoComplete="username"
        placeholder="Email"
        className="input w-full"
      />
      <input
        type="password"
        name="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        autoComplete="current-password"
        placeholder="Mật khẩu"
        className="input w-full"
      />
      {error && <p className="text-sm text-error">{error}</p>}
      <button disabled={busy || !email || !password} className="w-full btn btn-outline">
        {busy ? "Đang kiểm tra…" : "Đăng nhập bằng email"}
      </button>
    </form>
  );
}
