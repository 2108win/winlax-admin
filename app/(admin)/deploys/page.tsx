import { ago, dateTime } from "@/lib/format";
import { deployRuns } from "@/lib/server/history";

export const dynamic = "force-dynamic";

const label: Record<string, string> = { running: "đang chạy", ok: "xong", fail: "lỗi" };

export default async function DeploysPage() {
  const runs = await deployRuns(200);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Lịch sử deploy</h1>
      <p className="text-sm text-white/50">
        Mọi lần chạy lệnh deploy: từ trang này (admin), tự động khi push lên GitHub (webhook), hoặc qua SSH.
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-xs text-white/40">
            <tr>
              <th className="px-3 py-2">Lúc</th>
              <th className="px-3 py-2">Web</th>
              <th className="px-3 py-2">Thao tác</th>
              <th className="px-3 py-2">Kết quả</th>
              <th className="px-3 py-2">Commit</th>
              <th className="px-3 py-2">Nguồn</th>
              <th className="px-3 py-2">Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {runs.map((run) => (
              <tr key={run.run}>
                <td className="px-3 py-2 whitespace-nowrap" title={dateTime(run.startedAt)}>{ago(run.startedAt)}</td>
                <td className="px-3 py-2">{run.app}</td>
                <td className="px-3 py-2">{run.action}</td>
                <td className={`px-3 py-2 ${run.status === "ok" ? "text-emerald-300" : run.status === "fail" ? "text-red-300" : "text-sky-300"}`}>
                  {label[run.status] ?? run.status}
                  {run.seconds !== undefined && <span className="text-white/40"> ({run.seconds}s)</span>}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{run.commit ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-white/50">{run.source}{run.by ? ` (${run.by})` : ""}</td>
                <td className="px-3 py-2">
                  {run.log ? (
                    <a className="text-xs text-sky-300 hover:underline" href={`/api/deploy-logs/${run.log.split("/").pop()}`} target="_blank" rel="noreferrer">
                      xem
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-white/40" colSpan={7}>Chưa có lần deploy nào được ghi lại.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
