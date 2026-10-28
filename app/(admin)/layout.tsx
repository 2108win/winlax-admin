import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { getSession } from "@/lib/auth";
import { listApps } from "@/lib/server/apps";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const apps = await listApps();

  const link = "block rounded-md px-3 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white";
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-white/10 p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <p className="px-3 text-sm font-semibold">VPS winlax</p>
        <p className="px-3 text-xs text-white/40">180.93.233.145</p>
        <nav className="mt-4 space-y-0.5">
          <Link href="/" className={link}>Tổng quan</Link>
          <p className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-white/30">Web</p>
          {apps.map((app) => (
            <Link key={app.name} href={`/apps/${app.name}`} className={link}>
              {app.name}
            </Link>
          ))}
          <p className="px-3 pt-3 pb-1 text-xs uppercase tracking-wide text-white/30">Hệ thống</p>
          <Link href="/deploys" className={link}>Lịch sử deploy</Link>
          <Link href="/audit" className={link}>Nhật ký thao tác</Link>
        </nav>
        <div className="mt-6 space-y-1 px-3">
          <p className="truncate text-xs text-white/40">{session.email}</p>
          <LogoutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
