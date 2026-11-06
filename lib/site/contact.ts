import "server-only";

import { createDbClient, type DbClient } from "@/lib/site/db/client";

/** Messages from the contact form on winlax.id.vn (table contact_messages in winlax_v2). */
export type ContactMessageStatus = "archived" | "new" | "read";

export type ContactMessage = Readonly<{
  createdAt: string;
  email: string;
  id: string;
  locale: "en" | "vi";
  message: string;
  name: string;
  status: ContactMessageStatus;
}>;

type ContactRow = Readonly<{
  created_at: string;
  email: string;
  id: string;
  locale: "en" | "vi";
  message: string;
  name: string;
  status: ContactMessageStatus;
}>;

const COLUMNS = "id, name, email, message, locale, status, created_at";

function toMessage(row: ContactRow): ContactMessage {
  return {
    createdAt: row.created_at,
    email: row.email,
    id: row.id,
    locale: row.locale,
    message: row.message,
    name: row.name,
    status: row.status,
  };
}

export async function listContactMessages(
  limit = 100,
  client: DbClient = createDbClient(),
): Promise<ContactMessage[]> {
  const { data, error } = await client
    .from("contact_messages")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Không thể đọc tin nhắn: ${error.message}`);

  return ((data ?? []) as ContactRow[]).map(toMessage);
}

export async function setContactMessageStatus(
  id: string,
  status: ContactMessageStatus,
  client: DbClient = createDbClient(),
): Promise<void> {
  const { error } = await client
    .from("contact_messages")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(`Không thể cập nhật tin nhắn: ${error.message}`);
}

export async function deleteContactMessage(
  id: string,
  client: DbClient = createDbClient(),
): Promise<void> {
  const { error } = await client.from("contact_messages").delete().eq("id", id);
  if (error) throw new Error(`Không thể xóa tin nhắn: ${error.message}`);
}
