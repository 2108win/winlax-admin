"use client";

import { useState } from "react";

import { useStepUpFetch } from "@/components/step-up";

/** Sets, changes or turns off the email + password login (2FA still follows it). */
export function AccountPassword({
  email,
  setAt,
  minLength,
}: {
  email: string;
  setAt: string | null;
  minLength: number;
}) {
  const fetchWithStepUp = useStepUpFetch();
  const [enabledAt, setEnabledAt] = useState(setAt);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setMessage("Hai lần nhập mật khẩu không khớp.");
    setBusy(true);
    setMessage(null);
    const response = await fetchWithStepUp("/api/account/password", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, confirm }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(body.error ?? `Lỗi HTTP ${response.status}`);
    setPassword("");
    setConfirm("");
    setEnabledAt("vừa xong");
    setMessage("Đã lưu mật khẩu. Ở trang đăng nhập giờ có thêm ô email và mật khẩu.");
  }

  async function turnOff() {
    if (!window.confirm("Tắt đăng nhập bằng email và mật khẩu? Sau đó chỉ còn đăng nhập Google.")) return;
    setBusy(true);
    setMessage(null);
    const response = await fetchWithStepUp("/api/account/password", { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(body.error ?? `Lỗi HTTP ${response.status}`);
    setEnabledAt(null);
    setMessage("Đã tắt đăng nhập bằng mật khẩu.");
  }

  return (
    <section className="max-w-md rounded-xl border border-base-300 bg-base-200 p-4">
      <h2 className="text-xs uppercase tracking-wide text-base-content/40">Đăng nhập bằng email và mật khẩu</h2>
      <p className="mt-2 text-sm text-base-content/70">
        {enabledAt
          ? `Đang bật (đặt lúc ${enabledAt}). Sau email và mật khẩu vẫn phải nhập mã 2FA.`
          : "Đang tắt: chỉ đăng nhập được bằng Google. Đặt mật khẩu để bật; sau email và mật khẩu vẫn phải nhập mã 2FA."}
      </p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <input
          type="password"
          name="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          placeholder={`Mật khẩu mới (ít nhất ${minLength} ký tự)`}
          className="input w-full"
        />
        <input
          type="password"
          name="confirm-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu"
          className="input w-full"
        />
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || password.length < minLength || !confirm} className="btn btn-primary btn-sm">
            {busy ? "Đang lưu…" : enabledAt ? "Đổi mật khẩu" : "Đặt mật khẩu"}
          </button>
          {enabledAt && (
            <button type="button" disabled={busy} onClick={turnOff} className="btn btn-ghost btn-sm text-error">
              Tắt đăng nhập bằng mật khẩu
            </button>
          )}
        </div>
      </form>
      {message && <p className="mt-3 text-sm text-base-content/70">{message}</p>}
    </section>
  );
}
