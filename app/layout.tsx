import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Quản trị VPS | winlax",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
