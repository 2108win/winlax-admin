"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = Readonly<{ href: string; label: string }>;

export function AdminNav({ apps }: { apps: readonly string[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const item = ({ href, label }: Item) => (
    <li key={href}>
      <Link className={isActive(href) ? "menu-active" : undefined} href={href}>
        {label}
      </Link>
    </li>
  );

  return (
    <ul className="menu w-full p-0">
      {item({ href: "/", label: "Tổng quan" })}
      <li className="menu-title mt-2">Web</li>
      {apps.map((name) => item({ href: `/apps/${name}`, label: name }))}
      <li className="menu-title mt-2">Hệ thống</li>
      {item({ href: "/deploys", label: "Lịch sử deploy" })}
      {item({ href: "/database", label: "Database & SQL" })}
      {item({ href: "/backups", label: "Sao lưu" })}
      {item({ href: "/terminal", label: "Terminal" })}
      {item({ href: "/vault", label: "Vault 2FA" })}
      {item({ href: "/audit", label: "Nhật ký thao tác" })}
    </ul>
  );
}
