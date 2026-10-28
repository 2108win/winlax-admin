import { query } from "@/lib/db";
import { ago, dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const rows = await query<{ id: string; at: Date; email: string | null; ip: string | null; action: string; target: string | null; detail: unknown }>(
    "select id, at, email, ip, action, target, detail from admin_audit order by at desc limit 300",
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Nhật ký thao tác</h1>
      <p className="text-sm text-white/50">Mọi lần đăng nhập và thao tác trên trang quản trị.</p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.03] text-left text-xs text-white/40">
            <tr>
              <th className="px-3 py-2">Lúc</th>
              <th className="px-3 py-2">Thao tác</th>
              <th className="px-3 py-2">Đối tượng</th>
              <th className="px-3 py-2">Ai / IP</th>
              <th className="px-3 py-2">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 whitespace-nowrap" title={dateTime(row.at)}>{ago(row.at.toISOString())}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-3 py-2">{row.target ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-white/50">{row.email ?? "—"} · {row.ip ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-white/40">{row.detail ? JSON.stringify(row.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
