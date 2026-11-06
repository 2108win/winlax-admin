"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { audit } from "@/lib/audit";
import { getSession, type Session } from "@/lib/auth";
import { createVaultBackup } from "@/lib/vault/two-factor/backup";
import {
  getVaultEntryPrivateDetails,
  insertVaultEntry,
  insertVaultEntries,
  listEncryptedVaultRows,
  removeVaultEntry,
  renameVaultEntry,
  VaultLimitError,
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
async function requireVaultSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** The admin's own audit log. Ids and counts only, never names or secrets. */
async function auditVault(
  session: Session,
  action: string,
  target?: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    await audit({
      action,
      detail,
      email: session.email,
      ip: (await headers()).get("x-real-ip")?.trim() || "unknown",
      target,
    });
  } catch (error) {
    console.error("[vault] audit failed:", error instanceof Error ? error.message : error);
  }
}

/** Entries live in the /2fa table, so its limits apply; say which one was hit. */
function storeErrorMessage(error: unknown): string {
  if (error instanceof VaultLimitError) return error.message;
  if (error instanceof Error && error.message === "invalid_entry") {
    return "Dữ liệu vượt giới hạn của /2fa (tên 120, tài khoản 200, mật khẩu 4.096, ghi chú 5.000 ký tự).";
  }
  console.error("[vault] write failed:", error instanceof Error ? error.message : error);
  return "Không thể lưu vào database. Kiểm tra kết nối và thử lại.";
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
  const session = await requireVaultSession();

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
    await auditVault(session, "vault.create", undefined, { count: 1 });
    revalidatePath(getVaultAccessPath());
    return {
      message: `Đã mã hóa và thêm ${payload.issuer}.`,
      status: "success",
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      message: storeErrorMessage(error),
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
  const session = await requireVaultSession();

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
    await auditVault(session, "vault.create", undefined, { count: payloads.length });
    revalidatePath(getVaultAccessPath());
    return {
      message: `Đã mã hóa và thêm ${payloads.length} mã vào vault.`,
      status: "success",
      submittedAt: Date.now(),
    };
  } catch (error) {
    return {
      message: storeErrorMessage(error),
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
  const session = await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) {
    return { message: "Tài khoản không hợp lệ.", status: "error" };
  }

  try {
    const details = await getVaultEntryPrivateDetails(id);
    await auditVault(session, "vault.reveal", id);
    return { details, message: "Đã mở thông tin riêng.", status: "success" };
  } catch {
    return { message: "Không thể mở thông tin riêng.", status: "error" };
  }
}

export async function renameEntryAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  const session = await requireVaultSession();
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
    return actionError(storeErrorMessage(error));
  }

  await auditVault(session, "vault.rename", id);
  revalidatePath(getVaultAccessPath());
  return {
    message: `Đã đổi tên thành ${label.issuer}.`,
    status: "success",
    submittedAt: Date.now(),
  };
}

export async function deleteEntryAction(formData: FormData): Promise<void> {
  const session = await requireVaultSession();
  const id = String(formData.get("id") ?? "");
  if (!UUID_PATTERN.test(id)) return;

  await removeVaultEntry(id);
  await auditVault(session, "vault.delete", id);
  revalidatePath(getVaultAccessPath());
}

export async function exportVaultBackupAction(): Promise<VaultBackupState> {
  const session = await requireVaultSession();

  try {
    const backup = createVaultBackup(await listEncryptedVaultRows());
    await auditVault(session, "vault.backup", undefined, { rows: backup.count });
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
