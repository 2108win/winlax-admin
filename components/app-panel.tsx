"use client";

import { useEffect, useState } from "react";

import { EnvEditor } from "@/components/env-editor";
import { LogStream } from "@/components/log-stream";
import { ago, bytes, dateTime, duration } from "@/lib/format";

type Detail = {
  name: string;
  repo: string;
  branch: string;
  domains: string[];
  activePort: number;
  release: { commit: string; subject: string; date: string; dir: string } | null;
  processes: Array<{ name: string; status: string; cpu: number; memory: number; uptimeSince: number | null; restarts: number; cwd: string }>;
  runs: Array<{ run: string; action: string; source: string; by?: string; status: string; startedAt: string; finishedAt?: string; commit?: string; log?: string; seconds?: number }>;
  logFiles: string[];
};

const ACTIONS = [
  { action: "deploy", label: "Deploy bản mới nhất", confirm: "Clone code mới nhất từ GitHub, build và chuyển sang bản mới?" },
  { action: "restart", label: "Khởi động lại", confirm: "Khởi động lại app (dùng bản hiện tại)?" },
  { action: "rollback", label: "Quay lại bản trước", confirm: "Chuyển về bản deploy trước đó?" },
] as const;

const runLabel: Record<string, string> = { running: "đang chạy", ok: "xong", fail: "lỗi" };

export function AppPanel({ app }: { app: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [job, setJob] = useState<{ id: string; action: string } | null>(null);
  const [jobResult, setJobResult] = useState<string | null>(null);
  const [view, setView] = useState<"job" | "live" | { file: string }>("live");
  const [fileText, setFileText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      const response = await fetch(`/api/apps/${app}`, { cache: "no-store" });
      if (response.status === 401) return window.location.assign("/login");
      if (response.ok && alive) {
        setDetail((await response.json()) as Detail);
        setNow(Date.now());
      }
    }
    load();
    const timer = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [app, refreshKey]);

  async function run(action: (typeof ACTIONS)[number]) {
    if (!window.confirm(`${action.confirm}\n\nWeb: ${app}`)) return;
    setError(null);
    setJobResult(null);
    const response = await fetch(`/api/apps/${app}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: action.action }),
    });
    const body = (await response.json().catch(() => ({}))) as { job?: string; error?: string };
    if (!response.ok || !body.job) return setError(body.error ?? `HTTP ${response.status}`);
    setJob({ id: body.job, action: action.action });
    setView("job");
  }

  async function openFile(file: string) {
    setView({ file });
    setFileText("Đang tải…");
    const response = await fetch(`/api/deploy-logs/${file}`);
    setFileText(response.ok ? await response.text() : `Lỗi HTTP ${response.status}`);
  }

  if (!detail) return <p className="text-sm text-white/50">Đang tải…</p>;
  const tab = (active: boolean) =>
    `rounded-md px-3 py-1 text-sm ${active ? "bg-white/10 text-white" : "text-white/50 hover:text-white"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{detail.name}</h1>
        <p className="mt-1 text-sm text-white/50">
          {detail.domains.map((domain) => (
            <a key={domain} href={`https://${domain}`} target="_blank" rel="noreferrer" className="mr-3 hover:text-white">
              {domain} ↗
            </a>
          ))}
        </p>
        <p className="mt-1 text-xs text-white/40">
          {detail.repo} · nhánh {detail.branch} · nginx đang trỏ cổng {detail.activePort}
        </p>
      </div>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
          <h2 className="text-xs uppercase tracking-wide text-white/40">Bản đang chạy</h2>
          {detail.release ? (
            <div className="mt-2 space-y-1">
              <p>
                <span className="font-mono">{detail.release.commit}</span> {detail.release.subject}
              </p>
              <p className="text-xs text-white/40">commit lúc {dateTime(detail.release.date)} · {detail.release.dir}</p>
            </div>
          ) : (
            <p className="mt-2 text-white/40">Chưa deploy.</p>
          )}
          {detail.processes.map((proc) => (
            <p key={proc.name} className="mt-2 text-xs text-white/60">
              {proc.name}: {proc.status} · CPU {proc.cpu}% · RAM {bytes(proc.memory)} · chạy{" "}
              {proc.uptimeSince ? duration((now - proc.uptimeSince) / 1000) : "—"} · khởi động lại {proc.restarts} lần
            </p>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-xs uppercase tracking-wide text-white/40">Thao tác</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action.action}
                onClick={() => run(action)}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                {action.label}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <p className="mt-3 text-xs text-white/40">
            Deploy chạy nền trên server: đóng trang này vẫn chạy tiếp. Bản mới lỗi thì web vẫn giữ bản cũ.
          </p>
        </div>
      </section>

      <EnvEditor app={detail.name} />

      <section>
        <div className="mb-2 flex flex-wrap gap-1">
          <button className={tab(view === "live")} onClick={() => setView("live")}>Log app trực tiếp</button>
          {job && (
            <button className={tab(view === "job")} onClick={() => setView("job")}>
              Tác vụ {job.action} {jobResult ? `(${jobResult})` : "(đang chạy)"}
            </button>
          )}
          {typeof view === "object" && <span className={tab(true)}>{view.file}</span>}
        </div>
        {view === "live" && <LogStream key={`live-${app}`} url={`/api/apps/${app}/logs`} />}
        {view === "job" && job && (
          <LogStream
            key={job.id}
            url={`/api/jobs/${job.id}`}
            onEnd={(line) => {
              setJobResult(line.endsWith(" 0") ? "thành công" : "lỗi");
              setRefreshKey((key) => key + 1);
            }}
          />
        )}
        {typeof view === "object" && (
          <pre className="log-view h-96 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3">{fileText}</pre>
        )}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-xs uppercase tracking-wide text-white/40">Lịch sử deploy</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {detail.runs.length === 0 && <li className="text-white/40">Chưa có.</li>}
            {detail.runs.map((run) => (
              <li key={run.run} className="flex flex-wrap gap-x-2">
                <span className={run.status === "ok" ? "text-emerald-300" : run.status === "fail" ? "text-red-300" : "text-sky-300"}>
                  {runLabel[run.status] ?? run.status}
                </span>
                <span>{run.action}</span>
                <span className="font-mono text-white/50">{run.commit}</span>
                {run.seconds !== undefined && <span className="text-white/40">{run.seconds}s</span>}
                <span className="ml-auto text-xs text-white/40">
                  {run.source}{run.by ? ` (${run.by})` : ""} · {ago(run.startedAt)}
                </span>
                {run.log && (
                  <button className="text-xs text-sky-300 hover:underline" onClick={() => openFile(run.log!.split("/").pop()!)}>
                    log
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="text-xs uppercase tracking-wide text-white/40">File log deploy/build</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {detail.logFiles.length === 0 && <li className="text-white/40">Chưa có.</li>}
            {detail.logFiles.map((file) => (
              <li key={file}>
                <button className="font-mono text-xs text-sky-300 hover:underline" onClick={() => openFile(file)}>
                  {file}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
