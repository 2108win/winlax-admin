"use client";

import { useState } from "react";

import { useStepUpFetch } from "@/components/step-up";
import { bytes } from "@/lib/format";

type Result = {
  command: string;
  rowCount: number;
  statements: number;
  fields: string[];
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  ms: number;
};
type Table = { schema: string; name: string; rows: string; size: string };

function quoteIdent(name: string) {
  return `"${name.replace(/"/g, '""')}"`;
}

function show(value: unknown) {
  if (value === null || value === undefined) return <span className="text-white/30">NULL</span>;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function SqlConsole() {
  const fetchWithStepUp = useStepUpFetch();
  const [databases, setDatabases] = useState<Array<{ name: string; size: number }> | null>(null);
  const [db, setDb] = useState("");
  const [tables, setTables] = useState<Table[]>([]);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(target = "") {
    setError(null);
    const response = await fetchWithStepUp(`/api/db${target ? `?db=${encodeURIComponent(target)}` : ""}`);
    const body = (await response.json().catch(() => ({}))) as {
      databases?: Array<{ name: string; size: number }>;
      tables?: Table[];
      error?: string;
    };
    if (!response.ok) return setError(body.error ?? `Lỗi HTTP ${response.status}`);
    setDatabases(body.databases ?? []);
    setTables(body.tables ?? []);
  }

  async function execute(text = sql) {
    if (!db || !text.trim()) return;
    const destructive = /\b(drop|truncate|delete|update|alter|insert|create|grant|revoke)\b/i.test(text);
    if (destructive && !window.confirm(`Câu lệnh này có thể thay đổi dữ liệu trong "${db}". Chạy?`)) return;
    setBusy(true);
    setError(null);
    const response = await fetchWithStepUp("/api/db/sql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ db, sql: text }),
    });
    const body = (await response.json().catch(() => ({}))) as Result & { error?: string };
    setBusy(false);
    if (!response.ok) {
      setResult(null);
      return setError(body.error ?? `Lỗi HTTP ${response.status}`);
    }
    setResult(body);
  }

  function browse(table: Table) {
    const text = `select * from ${quoteIdent(table.schema)}.${quoteIdent(table.name)} limit 100;`;
    setSql(text);
    execute(text);
  }

  if (!databases) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Database & SQL</h1>
        <p className="text-sm text-white/50">Toàn quyền trên mọi database của VPS (role superuser). Cần nhập lại mã 2FA.</p>
        <button onClick={() => load()} className="rounded-lg bg-white px-3 py-1.5 text-sm text-black">Mở</button>
        {error && <p className="text-sm text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Database & SQL</h1>
        <select
          value={db}
          onChange={(event) => {
            setDb(event.target.value);
            setResult(null);
            if (event.target.value) load(event.target.value);
          }}
          className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-sm"
        >
          <option value="">Chọn database…</option>
          {databases.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} ({bytes(item.size)})
            </option>
          ))}
        </select>
      </div>
      {db && (
        <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
          <aside className="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-2 text-sm">
            {tables.length === 0 && <p className="p-2 text-white/40">Không có bảng.</p>}
            {tables.map((table) => (
              <button
                key={`${table.schema}.${table.name}`}
                onClick={() => browse(table)}
                className="block w-full truncate rounded px-2 py-1 text-left hover:bg-white/5"
                title={`${table.schema}.${table.name}`}
              >
                {table.schema === "public" ? "" : `${table.schema}.`}
                {table.name} <span className="text-xs text-white/30">~{table.rows} · {bytes(Number(table.size))}</span>
              </button>
            ))}
          </aside>
          <div className="min-w-0 space-y-3">
            <textarea
              value={sql}
              onChange={(event) => setSql(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") execute();
              }}
              spellCheck={false}
              placeholder="select now();   (Ctrl/⌘ + Enter để chạy)"
              className="log-view h-40 w-full rounded-lg border border-white/10 bg-black/50 p-3 outline-none focus:border-white/30"
            />
            <div className="flex items-center gap-3">
              <button disabled={busy || !sql.trim()} onClick={() => execute()} className="rounded-lg bg-white px-3 py-1.5 text-sm text-black disabled:opacity-40">
                {busy ? "Đang chạy…" : "Chạy"}
              </button>
              {result && (
                <p className="text-xs text-white/50">
                  {result.command} · {result.rowCount ?? 0} dòng · {result.ms} ms
                  {result.statements > 1 && ` · ${result.statements} câu (hiện kết quả câu cuối)`}
                  {result.truncated && " · chỉ hiện 1000 dòng đầu"}
                </p>
              )}
            </div>
            {error && <pre className="log-view rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-red-200">{error}</pre>}
            {result && result.fields.length > 0 && (
              <div className="max-h-[60vh] overflow-auto rounded-xl border border-white/10">
                <table className="text-xs">
                  <thead className="sticky top-0 bg-[#141821] text-left text-white/50">
                    <tr>{result.fields.map((field) => <th key={field} className="px-2 py-1.5 font-medium whitespace-nowrap">{field}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {result.rows.map((row, index) => (
                      <tr key={index}>
                        {result.fields.map((field) => (
                          <td key={field} className="max-w-96 truncate px-2 py-1 align-top" title={typeof row[field] === "string" ? (row[field] as string) : undefined}>
                            {show(row[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
