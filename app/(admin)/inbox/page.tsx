import type { Metadata } from "next";

import { MessagesPanel } from "./messages-panel";
import { type ContactMessage, listContactMessages } from "@/lib/site/contact";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Hộp thư liên hệ | Quản trị VPS",
};

export default async function InboxPage() {
  let messages: ContactMessage[] = [];
  let loadFailed = false;
  try {
    messages = await listContactMessages();
  } catch (error) {
    console.error("[inbox] load failed:", error instanceof Error ? error.message : error);
    loadFailed = true;
  }
  return <MessagesPanel loadFailed={loadFailed} messages={messages} />;
}
