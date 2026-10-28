"use client";

import { useEffect, useState } from "react";

import { useStepUpFetch } from "@/components/step-up";
import { bytes, dateTime } from "@/lib/format";

type Db = { db: string; files: Array<{ name: string; size: number; at: string }> };

export function BackupsPanel() {
  const fetchWithStepUp = useStepUpFetch();
  const [dbs, setDbs] = useState<Db[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/backups", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { databases?: Db[] }) => alive && setDbs(body.databases ?? []));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  async function backupNow() {
    setBusy(true);
    setMessage("Đang sao lưu…");
    const response = await fetch("/api/backups", { method: "POST" });
    const body = (await response.json().catch(() => ({}))) as { output?: string; error?: string };
    setBusy(false);
    setMessage(response.ok ? body.output || "Đã sao lưu." : (body.error ?? `Lỗi HTTP ${response.status}`));
    setRefreshKey((key) => key + 1);
  }

  async function download(db: string, file: string) {
    const url = `/api/backups/download?db=${encodeURIComponent(db)}&file=${encodeURIComponent(file)}`;
    const response = await fetchWithStepUp(url);
    if (!response.ok) return setMessage(`Không tải được (HTTP ${response.status})`);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = file;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function restore(db: string, file: string) {
    const typed = window.prompt(
      `KHÔI PHỤC database "${db}" về bản ${file}?\n\nDữ liệu hiện tại sẽ bị thay bằng bản này (hệ thống sao lưu toàn bộ trước khi khôi phục).\nGõ đúng tên database để xác nhận:`,
    );
    if (typed === null) return;
    setBusy(true);
    setMessage(`Đang khôi phục ${db}…`);
    const response = await fetchWithStepUp("/api/backups/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, file, confirm: typed }),
    });
    const body = (await response.json().catch(() => ({}))) as { output?: string; error?: string };
    setBusy(false);
    setMessage(response.ok ? `Đã khôi phục ${db}. ${body.output ?? ""}` : (body.error ?? body.output ?? `Lỗi HTTP ${response.status}`));
    setRefreshKey((key) => key + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Sao lưu PostgreSQL</h1>
        <button disabled={busy} onClick={backupNow} className="ml-auto rounded-lg bg-white px-3 py-1.5 text-sm text-black disabled:opacity-40">
          Sao lưu ngay
        </button>
      </div>
      <p className="text-sm text-white/50">
        Tự động lúc 2:30 sáng mỗi ngày, giữ 14 ngày, ở /var/backups/postgres trên VPS. Nên tải bản quan trọng về máy.
      </p>
      {message && <pre className="log-view rounded-lg border border-white/10 bg-black/40 p-3">{message}</pre>}
      {!dbs && <p className="text-sm text-white/50">Đang tải…</p>}
      {dbs?.map((db) => (
        <section key={db.db} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="font-medium">{db.db}</h2>
          <ul className="mt-2 divide-y divide-white/5 text-sm">
            {db.files.map((file) => (
              <li key={file.name} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                <span className="font-mono text-xs">{file.name}</span>
                <span className="text-white/40">{bytes(file.size)}</span>
                <span className="text-xs text-white/40">{dateTime(file.at)}</span>
                <button onClick={() => download(db.db, file.name)} className="ml-auto text-xs text-sky-300 hover:underline">
                  Tải về
                </button>
                <button disabled={busy} onClick={() => restore(db.db, file.name)} className="text-xs text-red-300 hover:underline">
                  Khôi phục
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
