"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ago, bytes, dateTime, duration } from "@/lib/format";

type Proc = { name: string; status: string; cpu: number; memory: number; uptimeSince: number | null; restarts: number };
type Data = {
  system: {
    hostname: string;
    kernel: string;
    cpus: number;
    cpuPercent: number;
    load: number[];
    uptimeSeconds: number;
    memory: { total: number; available: number; swapTotal: number; swapFree: number };
    disk: { total: number; free: number };
    network: { rxPerSec: number; txPerSec: number; rxTotal: number; txTotal: number };
  };
  apps: Array<{
    name: string;
    domains: string[];
    activePort: number;
    release: { commit: string; subject: string; date: string } | null;
    process: Proc | null;
  }>;
  otherProcesses: Proc[];
  databases: Array<{ name: string; size: number }>;
  certificates: Array<{ name: string; domains: string; validTo: string | null }>;
  backups: Array<{ db: string; file: string | null; size: number; at: string | null; count: number }>;
  runs: Array<{ run: string; app: string; action: string; source: string; status: string; startedAt: string; commit?: string }>;
  fetchedAt: number;
};

function Bar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="text-xs uppercase tracking-wide text-white/40">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const statusColor: Record<string, string> = {
  online: "text-emerald-300",
  ok: "text-emerald-300",
  running: "text-sky-300",
  fail: "text-red-300",
  stopped: "text-white/40",
  errored: "text-red-300",
};

export function Overview() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch("/api/overview", { cache: "no-store" });
        if (response.status === 401) return window.location.assign("/login");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as Data;
        if (alive) {
          setData({ ...body, fetchedAt: Date.now() });
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!data) return <p className="text-sm text-white/50">{error ? `Lỗi: ${error}` : "Đang tải…"}</p>;
  const { system } = data;
  const memUsed = system.memory.total - system.memory.available;
  const swapUsed = system.memory.swapTotal - system.memory.swapFree;
  const diskUsed = system.disk.total - system.disk.free;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Tổng quan</h1>
        <p className="text-xs text-white/40">
          {system.hostname} · kernel {system.kernel} · chạy {duration(system.uptimeSeconds)}
          {error && <span className="ml-2 text-red-300">(lỗi cập nhật: {error})</span>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={`CPU (${system.cpus} lõi)`}>
          <p className="text-2xl font-semibold">{system.cpuPercent}%</p>
          <Bar value={system.cpuPercent} />
          <p className="mt-2 text-xs text-white/50">Load {system.load.map((n) => n.toFixed(2)).join(" / ")}</p>
        </Card>
        <Card title="RAM">
          <p className="text-2xl font-semibold">{bytes(memUsed)} <span className="text-sm text-white/40">/ {bytes(system.memory.total)}</span></p>
          <Bar value={(memUsed / system.memory.total) * 100} />
          <p className="mt-2 text-xs text-white/50">Swap {bytes(swapUsed)} / {bytes(system.memory.swapTotal)}</p>
        </Card>
        <Card title="Ổ cứng /">
          <p className="text-2xl font-semibold">{bytes(diskUsed)} <span className="text-sm text-white/40">/ {bytes(system.disk.total)}</span></p>
          <Bar value={(diskUsed / system.disk.total) * 100} />
          <p className="mt-2 text-xs text-white/50">Còn trống {bytes(system.disk.free)}</p>
        </Card>
        <Card title="Mạng">
          <p className="text-sm">↓ {bytes(system.network.rxPerSec)}/s · ↑ {bytes(system.network.txPerSec)}/s</p>
          <p className="mt-2 text-xs text-white/50">
            Tổng nhận {bytes(system.network.rxTotal)} · gửi {bytes(system.network.txTotal)}
          </p>
        </Card>
      </div>

      <Card title="Web">
        <div className="divide-y divide-white/5">
          {data.apps.map((app) => (
            <Link key={app.name} href={`/apps/${app.name}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 hover:bg-white/[0.02]">
              <div className="min-w-40">
                <p className="font-medium">{app.name}</p>
                <p className="text-xs text-white/40">{app.domains[0]} · cổng {app.activePort}</p>
              </div>
              <p className={`text-sm ${statusColor[app.process?.status ?? ""] ?? "text-red-300"}`}>
                {app.process?.status ?? "không chạy"}
              </p>
              {app.process && (
                <p className="text-xs text-white/50">
                  CPU {app.process.cpu}% · RAM {bytes(app.process.memory)} · chạy{" "}
                  {app.process.uptimeSince ? duration((data.fetchedAt - app.process.uptimeSince) / 1000) : "—"} ·{" "}
                  khởi động lại {app.process.restarts} lần
                </p>
              )}
              {app.release && (
                <p className="min-w-0 flex-1 truncate text-xs text-white/40">
                  {app.release.commit} {app.release.subject}
                </p>
              )}
            </Link>
          ))}
        </div>
        {data.otherProcesses.length > 0 && (
          <p className="mt-3 text-xs text-white/40">
            Tiến trình khác:{" "}
            {data.otherProcesses.map((p) => `${p.name} (${p.status}, ${bytes(p.memory)})`).join(" · ")}
          </p>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Deploy gần đây">
          <ul className="space-y-1.5 text-sm">
            {data.runs.length === 0 && <li className="text-white/40">Chưa có.</li>}
            {data.runs.map((run) => (
              <li key={run.run} className="flex gap-2">
                <span className={statusColor[run.status] ?? ""}>{run.status === "running" ? "đang chạy" : run.status === "ok" ? "xong" : "lỗi"}</span>
                <span>{run.action} {run.app}</span>
                <span className="text-white/40">{run.commit}</span>
                <span className="ml-auto text-xs text-white/40">{run.source} · {ago(run.startedAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Database & sao lưu">
          <ul className="space-y-1.5 text-sm">
            {data.databases.map((db) => {
              const backup = data.backups.find((b) => b.db === db.name);
              return (
                <li key={db.name} className="flex gap-2">
                  <span>{db.name}</span>
                  <span className="text-white/40">{bytes(db.size)}</span>
                  <span className="ml-auto text-xs text-white/40">
                    {backup?.at ? `sao lưu ${ago(backup.at)} (${backup.count} bản)` : "chưa sao lưu"}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Chứng chỉ SSL">
          <ul className="space-y-1.5 text-sm">
            {data.certificates.map((cert) => (
              <li key={cert.name} className="flex gap-2">
                <span>{cert.domains || cert.name}</span>
                <span className="ml-auto text-xs text-white/40">hết hạn {dateTime(cert.validTo)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
