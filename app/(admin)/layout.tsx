import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin-nav";
import { LogoutButton } from "@/components/logout-button";
import { StepUpProvider } from "@/components/step-up";
import { ThemePicker } from "@/components/theme-picker";
import { getSession } from "@/lib/auth";
import { listApps } from "@/lib/server/apps";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const apps = await listApps();

  return (
    <div className="drawer md:drawer-open">
      <input aria-label="Mở menu" className="drawer-toggle" id="admin-drawer" type="checkbox" />
      <div className="drawer-content flex min-h-screen min-w-0 flex-col">
        <header className="navbar border-b border-base-300 bg-base-100 md:hidden">
          <label aria-label="Mở menu" className="btn btn-ghost btn-sm" htmlFor="admin-drawer">
            ☰
          </label>
          <span className="ml-2 font-semibold">VPS winlax</span>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <StepUpProvider>{children}</StepUpProvider>
        </main>
      </div>
      <div className="drawer-side z-40">
        <label aria-label="Đóng menu" className="drawer-overlay" htmlFor="admin-drawer" />
        <aside className="flex min-h-full w-60 flex-col gap-4 border-r border-base-300 bg-base-200 p-4">
          <div className="px-2">
            <p className="font-semibold">VPS winlax</p>
            <p className="text-xs text-base-content/50">180.93.233.145</p>
          </div>
          <AdminNav apps={apps.map((app) => app.name)} />
          <div className="mt-auto space-y-3 px-2">
            <ThemePicker />
            <p className="truncate text-xs text-base-content/50">{session.email}</p>
            <LogoutButton />
          </div>
        </aside>
      </div>
    </div>
  );
}
