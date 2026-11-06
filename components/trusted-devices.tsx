"use client";

import { useState } from "react";

export type TrustedDeviceRow = {
  id: string;
  label: string;
  ip: string | null;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
};

/** Devices that skip 2FA at login, each with a button to forget it. */
export function TrustedDevices({ devices: initial }: { devices: TrustedDeviceRow[] }) {
  const [devices, setDevices] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function forget(id: string | null) {
    const question = id
      ? "Quên máy này? Lần đăng nhập sau trên máy đó sẽ phải nhập mã 2FA."
      : "Quên tất cả các máy? Lần đăng nhập sau trên mọi máy sẽ phải nhập mã 2FA.";
    if (!window.confirm(question)) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/account/devices", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(body.error ?? `Lỗi HTTP ${response.status}`);
    setDevices((current) => (id ? current.filter((device) => device.id !== id) : []));
    setMessage(id ? "Đã quên máy đó." : "Đã quên tất cả các máy.");
  }

  return (
    <section className="max-w-md rounded-xl border border-base-300 bg-base-200 p-4">
      <h2 className="text-xs uppercase tracking-wide text-base-content/40">Máy đã ghi nhớ</h2>
      <p className="mt-2 text-sm text-base-content/70">
        Đăng nhập trên các máy này không cần mã 2FA. Máy được nhớ 90 ngày kể từ lần dùng gần nhất. Thao tác
        nguy hiểm vẫn hỏi lại mã.
      </p>
      {devices.length === 0 ? (
        <p className="mt-3 text-sm text-base-content/50">
          Chưa ghi nhớ máy nào. Khi đăng nhập trên máy lạ, chọn “Ghi nhớ máy này” lúc nhập mã 2FA.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-base-300">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {device.label}
                  {device.current && <span className="badge badge-primary badge-sm ml-2">Máy này</span>}
                </p>
                <p className="text-xs text-base-content/50">
                  Dùng gần nhất {device.lastUsedAt}
                  {device.ip ? ` · IP ${device.ip}` : ""} · nhớ tới {device.expiresAt}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => forget(device.id)}
                className="btn btn-ghost btn-sm text-error"
              >
                Quên
              </button>
            </li>
          ))}
        </ul>
      )}
      {devices.length > 1 && (
        <button type="button" disabled={busy} onClick={() => forget(null)} className="btn btn-ghost btn-sm mt-2 text-error">
          Quên tất cả
        </button>
      )}
      {message && <p className="mt-3 text-sm text-base-content/70">{message}</p>}
    </section>
  );
}
