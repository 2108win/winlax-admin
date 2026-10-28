import type { Metadata } from "next";

import { themeBootScript } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: "Quản trị VPS | winlax",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html data-theme="dim" lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
