"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { getSession } from "@/lib/auth";
import { deleteContactMessage, setContactMessageStatus } from "@/lib/site/contact";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Server actions are reachable by a direct POST, so each one checks the admin login itself:
 * the layout's redirect only guards page renders.
 */
async function requireMessageId(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const id = String(formData.get("id") ?? "");
  return { id: UUID.test(id) ? id : null, session };
}

export async function markMessageReadAction(formData: FormData): Promise<void> {
  const { id } = await requireMessageId(formData);
  if (!id) return;
  await setContactMessageStatus(id, "read");
  revalidatePath("/inbox");
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  const { id, session } = await requireMessageId(formData);
  if (!id) return;
  await deleteContactMessage(id);
  await audit({
    action: "contact.delete",
    email: session.email,
    ip: (await headers()).get("x-real-ip")?.trim() || "unknown",
    target: id,
  });
  revalidatePath("/inbox");
}
