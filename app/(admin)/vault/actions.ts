"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import {
  deleteContactMessage,
  setContactMessageStatus,
} from "@/lib/vault/contact/repository";
import {
  auditInBackground,
  getRequestActor,
} from "@/lib/vault/security/request-actor";
import { createVaultBackup } from "@/lib/vault/two-factor/backup";
import {
  getVaultEntryPrivateDetails,
  insertVaultEntry,
  insertVaultEntries,
  listEncryptedVaultRows,
  removeVaultEntry,
  renameVaultEntry,
  VaultRenameIncompleteError,
} from "@/lib/vault/two-factor/repository";
import {
  InvalidCredentialError,
  prepareCredentialPayload,
  prepareEntryLabel,
} from "@/lib/vault/two-factor/credential";
import { getVaultAccessPath } from "@/lib/vault/two-factor/path";
import {
  MAX_IMPORT_ENTRIES,
  prepareVaultPayload,
} from "@/lib/vault/two-factor/totp-source";
import type {
  VaultActionState,
  VaultBackupState,
  VaultImportInput,
  VaultPayload,
  VaultRevealState,
} from "@/lib/vault/two-factor/types";

/**
 * Server actions are reachable by a direct POST, so each one checks the admin login itself
 * (Google + 2FA): the layout's redirect only guards page renders. The vault has no lock of its
 * own any more.
 */
async function requireVaultSession(): Promise<void> {
  if (!(await getSession())) redirect("/login");
}

function actionError(
  message: string,
  fieldErrors?: VaultActionState["fieldErrors"],
): VaultActionState {
  return { fieldErrors, message, status: "error", submittedAt: Date.now() };
}

export async function createEntryAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  await requireVaultSession();

  let payload: VaultPayload;

  try {
    payload = prepareCredentialPayload({
      account: String(formData.get("account") ?? ""),
      issuer: String(formData.get("issuer") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      password: String(formData.get("credentialPassword") ?? ""),
      totpSource: String(formData.get("secret") ?? ""),
      website: String(formData.get("website") ?? ""),
    });
  } catch (error) {
    const fieldErrors: VaultActionState["fieldErrors"] = {};
    if (error instanceof InvalidCredentialError) {
      for (const issue of error.issues)
        fieldErrors[issue.field] = issue.message;
    }
    return {
      fieldErrors,
      message:
        error instanceof Error
          ? error.message
          : "Thông tin tài khoản chưa hợp lệ.",
      status: "error",
      submittedAt: Date.now(),
    };
  }

  try {
    await insertVaultEntry(payload);
    auditInBackground({
      actorHash: await getRequestActor(),
      kind: "entry_created",
      meta: { count: 1 },
    });
    revalidatePath(getVaultAccessPath());
    return {
      message: `Đã mã hóa và thêm ${payload.issuer}.`,
      status: "success",
      submittedAt: Date.now(),
    };
  } catch {
    return {
      message: "Không thể lưu vào database. Kiểm tra kết nối và thử lại.",
      status: "error",
      submittedAt: Date.now(),
    };
  }
}

function parseImportInputs(
  value: FormDataEntryValue | null,
): VaultImportInput[] {
  if (typeof value !== "string" || !value || value.length > 250_000) {
    throw new Error("Danh sách nhập không hợp lệ.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Danh sách nhập không hợp lệ.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Chưa có mã 2FA hợp lệ để nhập.");
  }
  if (parsed.length > MAX_IMPORT_ENTRIES) {
    throw new Error(`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ENTRIES} mã.`);
  }

  return parsed.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Danh sách nhập chứa dữ liệu không hợp lệ.");
    }

    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.source !== "string" ||
      (candidate.issuer !== undefined &&
        typeof candidate.issuer !== "string") ||
      (candidate.account !== undefined && typeof candidate.account !== "string")
    ) {
      throw new Error("Danh sách nhập chứa dữ liệu không hợp lệ.");
    }

    return {
      account: candidate.account,
      issuer: candidate.issuer,
      source: candidate.source,
    };
  });
}

export async function createEntriesAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  await requireVaultSession();

  let payloads: VaultPayload[];
  try {
    const inputs = parseImportInputs(formData.get("entries"));
    payloads = inputs.map(prepareVaultPayload);

    const fingerprints = new Set<string>();
    for (const payload of payloads) {
      const fingerprint = [
        payload.issuer.toLocaleLowerCase("vi"),
        payload.account.toLocaleLowerCase("vi"),
        payload.totp?.secret,
        payload.totp?.algorithm,
        payload.totp?.digits,
        payload.totp?.period,
      ].join("\u0000");
      if (fingerprints.has(fingerprint)) {
        throw new Error("Danh sách nhập có mã bị lặp.");
      }
      fingerprints.add(fingerprint);
    }
  } catch (error) {
    return {
      fieldErrors: {
        entries:
          error instanceof Error ? error.message : "Dữ liệu không hợp lệ.",
      },
      message: "Chưa thể nhập các mã 2FA.",
      status: "error",
      submittedAt: Date.now(),
    };
  }

  try {
    await insertVaultEntries(payloads);
    auditInBackground({
      actorHash: await getRequestActor(),
      kind: "entry_created",
      meta: { count: payloads.length },
    });
    revalidatePath(getVaultAccessPath());
    return {
      message: `Đã mã hóa và thêm ${payloads.length} mã vào vault.`,
      status: "success",
      submittedAt: Date.now(),
    };
  } catch {
    return {
      message: "Không thể lưu vào database. Kiểm tra kết nối và thử lại.",
      status: "error",
      submittedAt: Date.now(),
    };
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function revealEntryDetailsAction(
  _previousState: VaultRevealState,
  formData: FormData,
): Promise<VaultRevealState> {
  await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return { message: "Tài khoản không hợp lệ.", status: "error" };
  }

  try {
    const details = await getVaultEntryPrivateDetails(id);
    auditInBackground({
      actorHash: await getRequestActor(),
      kind: "details_revealed",
      meta: { entry: id },
    });
    return { details, message: "Đã mở thông tin riêng.", status: "success" };
  } catch {
    return { message: "Không thể mở thông tin riêng.", status: "error" };
  }
}

export async function renameEntryAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return actionError("Tài khoản không hợp lệ.");
  }

  let label: ReturnType<typeof prepareEntryLabel>;
  try {
    label = prepareEntryLabel({
      account: String(formData.get("account") ?? ""),
      issuer: String(formData.get("issuer") ?? ""),
    });
  } catch (error) {
    const fieldErrors: VaultActionState["fieldErrors"] = {};
    if (error instanceof InvalidCredentialError) {
      for (const issue of error.issues)
        fieldErrors[issue.field] = issue.message;
    }
    return actionError("Tên chưa hợp lệ.", fieldErrors);
  }

  try {
    await renameVaultEntry(id, label);
  } catch (error) {
    if (!(error instanceof VaultRenameIncompleteError)) {
      return actionError(
        "Không thể đổi tên. Kiểm tra kết nối database và thử lại.",
      );
    }
    revalidatePath(getVaultAccessPath());
    return actionError(
      "Đã lưu tên mới nhưng chưa xóa được bản cũ. Hãy xóa thẻ mang tên cũ.",
    );
  }

  auditInBackground({
    actorHash: await getRequestActor(),
    kind: "entry_renamed",
    meta: { entry: id },
  });
  revalidatePath(getVaultAccessPath());
  return {
    message: `Đã đổi tên thành ${label.issuer}.`,
    status: "success",
    submittedAt: Date.now(),
  };
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;

  await removeVaultEntry(id);
  auditInBackground({
    actorHash: await getRequestActor(),
    kind: "entry_deleted",
    meta: { entry: id },
  });
  revalidatePath(getVaultAccessPath());
}

export async function exportVaultBackupAction(): Promise<VaultBackupState> {
  await requireVaultSession();

  try {
    const backup = createVaultBackup(await listEncryptedVaultRows());
    auditInBackground({
      actorHash: await getRequestActor(),
      kind: "backup_exported",
      meta: { rows: backup.count },
    });
    return {
      backup,
      message: `Đã tạo bản sao lưu ${backup.count} bản ghi (vẫn được mã hóa).`,
      status: "success",
    };
  } catch {
    return {
      message:
        "Không thể tạo bản sao lưu. Kiểm tra kết nối database và thử lại.",
      status: "error",
    };
  }
}

export async function markMessageReadAction(formData: FormData): Promise<void> {
  await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;

  await setContactMessageStatus(id, "read");
  revalidatePath(getVaultAccessPath());
}

export async function deleteMessageAction(formData: FormData): Promise<void> {
  await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;

  await deleteContactMessage(id);
  auditInBackground({
    actorHash: await getRequestActor(),
    kind: "message_deleted",
    meta: { message: id },
  });
  revalidatePath(getVaultAccessPath());
}
