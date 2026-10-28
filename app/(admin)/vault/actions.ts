"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  deleteContactMessage,
  setContactMessageStatus,
} from "@/lib/vault/contact/repository";
import {
  findBlockingRateLimit,
  recordSecurityEvent,
} from "@/lib/vault/security/events";
import { UNLOCK_ACTOR_RULE, UNLOCK_GLOBAL_RULE } from "@/lib/vault/security/policies";
import { formatRetryAfter } from "@/lib/vault/security/rate-limit";
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
  clearVaultSessionCookie,
  endVaultSession,
  getVaultSession,
  startVaultSession,
  verifyVaultPassword,
} from "@/lib/vault/two-factor/session";
import {
  buildOtpauthUri,
  generateTotpSecret,
  isGeneratedTotpSecret,
  verifyTotpCode,
} from "@/lib/vault/two-factor/totp";
import {
  consumeUnlockTotpStep,
  deleteUnlockTotp,
  readUnlockTotp,
  revokeAllVaultSessions,
  saveUnlockTotp,
  touchVaultSession,
  type UnlockTotpSetting,
} from "@/lib/vault/two-factor/vault-store";
import {
  MAX_IMPORT_ENTRIES,
  prepareVaultPayload,
} from "@/lib/vault/two-factor/totp-source";
import type {
  UnlockTotpSetupState,
  VaultActionState,
  VaultBackupState,
  VaultImportInput,
  VaultPayload,
  VaultRevealState,
} from "@/lib/vault/two-factor/types";

/** Redirects to the unlock screen unless this browser is signed in; records the activity. */
async function requireVaultSession(): Promise<string> {
  const session = await getVaultSession();
  if (session.status !== "active") redirect(getVaultAccessPath());
  try {
    await touchVaultSession(session.id);
  } catch (error) {
    console.error(
      "[vault] could not record activity:",
      error instanceof Error ? error.message : error,
    );
  }
  return session.id;
}

function unlockError(
  message: string,
  fieldErrors?: VaultActionState["fieldErrors"],
): VaultActionState {
  return { fieldErrors, message, status: "error", submittedAt: Date.now() };
}

const UNAVAILABLE = "Vault tạm thời không khả dụng. Hãy thử lại sau ít phút.";

/**
 * Checks the attempt limits before any secret is compared, so a locked-out client learns
 * nothing. Returns an error message when the attempt must stop, or null to go on.
 */
async function checkUnlockLimits(actor: string): Promise<string | null> {
  try {
    const blocked = await findBlockingRateLimit(
      [UNLOCK_ACTOR_RULE, UNLOCK_GLOBAL_RULE],
      actor,
    );
    return blocked
      ? `Quá nhiều lần thử. Hãy thử lại sau ${formatRetryAfter(blocked.retryAfterSeconds)}.`
      : null;
  } catch {
    // Fail closed: without the event store the attempt limit cannot be enforced.
    return UNAVAILABLE;
  }
}

/** Every wrong password or code counts toward the same limit, wherever it was entered. */
async function recordFailedAttempt(actor: string): Promise<void> {
  try {
    await recordSecurityEvent({ actorHash: actor, kind: "unlock_failed" });
  } catch (error) {
    console.error(
      "[security] could not record a failed unlock:",
      error instanceof Error ? error.message : error,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 350));
}

export async function unlockVaultAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  const password = String(formData.get("password") ?? "");
  const code = String(formData.get("code") ?? "");
  if (!password) {
    return unlockError("Thiếu mật khẩu.", {
      password: "Hãy nhập mật khẩu vault.",
    });
  }

  const actor = await getRequestActor();
  const limited = await checkUnlockLimits(actor);
  if (limited) return unlockError(limited);

  let unlockTotp: UnlockTotpSetting;
  try {
    unlockTotp = await readUnlockTotp();
  } catch {
    // Fail closed: if we cannot tell whether a code is required, do not open without one.
    return unlockError(UNAVAILABLE);
  }

  const passwordOk = verifyVaultPassword(password);
  const step = unlockTotp.enabled
    ? verifyTotpCode(unlockTotp.secret, code)
    : null;
  if (!passwordOk || (unlockTotp.enabled && step === null)) {
    await recordFailedAttempt(actor);
    return unlockTotp.enabled
      ? unlockError("Không thể mở vault.", {
          code: "Mật khẩu hoặc mã xác minh không đúng.",
        })
      : unlockError("Không thể mở vault.", {
          password: "Mật khẩu không đúng. Hãy thử lại.",
        });
  }

  let replayed = false;
  try {
    replayed = unlockTotp.enabled && !(await consumeUnlockTotpStep(step!));
    if (!replayed) await startVaultSession(actor);
  } catch {
    return unlockError(UNAVAILABLE);
  }
  if (replayed) {
    // Counted and worded like any other failure, so a reused code cannot confirm the password.
    await recordFailedAttempt(actor);
    return unlockError("Không thể mở vault.", {
      code: "Mật khẩu hoặc mã xác minh không đúng, hoặc mã vừa được dùng. Hãy đợi mã mới.",
    });
  }

  auditInBackground({ actorHash: actor, kind: "unlock_ok" });
  redirect(getVaultAccessPath());
}

/** Signs this browser out. */
export async function lockVaultAction(): Promise<void> {
  await endVaultSession();
  redirect(getVaultAccessPath());
}

/** Signs every browser out, including this one. */
export async function lockEverywhereAction(): Promise<void> {
  await requireVaultSession();
  try {
    await revokeAllVaultSessions();
  } catch {
    // Still sign this browser out; the others stay until they go idle or expire.
    await endVaultSession();
    redirect(getVaultAccessPath());
  }
  auditInBackground({
    actorHash: await getRequestActor(),
    kind: "sessions_revoked",
  });
  await clearVaultSessionCookie();
  redirect(getVaultAccessPath());
}

/**
 * Called by the dashboard at most once a minute while the owner is actually using it, so an
 * open but untouched tab still goes idle and locks.
 */
export async function keepVaultSessionAliveAction(): Promise<{
  active: boolean;
}> {
  const session = await getVaultSession();
  if (session.status !== "active") return { active: false };
  try {
    await touchVaultSession(session.id);
  } catch {
    // A missed heartbeat only brings the idle lock closer.
  }
  return { active: true };
}

/** Creates a new secret to scan. Nothing is stored until a code from it is confirmed. */
export async function startUnlockTotpSetupAction(): Promise<UnlockTotpSetupState> {
  await requireVaultSession();
  try {
    if ((await readUnlockTotp()).enabled) {
      return { message: "Mã xác minh đã được bật.", status: "error" };
    }
  } catch {
    return { message: UNAVAILABLE, status: "error" };
  }

  const secret = generateTotpSecret();
  return {
    message: "",
    setup: {
      otpauthUri: buildOtpauthUri(secret, "Private Vault", "Winlax"),
      secret,
    },
    status: "idle",
  };
}

export async function enableUnlockTotpAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  const sessionId = await requireVaultSession();
  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!isGeneratedTotpSecret(secret)) {
    return unlockError("Mã thiết lập không hợp lệ. Hãy bắt đầu lại.");
  }

  const actor = await getRequestActor();
  const limited = await checkUnlockLimits(actor);
  if (limited) return unlockError(limited);

  const step = verifyTotpCode(secret, code);
  if (!verifyVaultPassword(password) || step === null) {
    await recordFailedAttempt(actor);
    return unlockError("Chưa bật được mã xác minh.", {
      code: "Mật khẩu hoặc mã xác minh không đúng.",
    });
  }

  try {
    if ((await readUnlockTotp()).enabled) {
      return unlockError("Mã xác minh đã được bật.");
    }
    await saveUnlockTotp(secret, step);
    // Anyone else who was signed in got in without the code: sign them out.
    await revokeAllVaultSessions({ exceptId: sessionId });
  } catch {
    return unlockError(UNAVAILABLE);
  }

  auditInBackground({ actorHash: actor, kind: "unlock_totp_enabled" });
  revalidatePath(getVaultAccessPath());
  return {
    message: "Đã bật mã xác minh. Các phiên khác đã bị đăng xuất.",
    status: "success",
    submittedAt: Date.now(),
  };
}

export async function disableUnlockTotpAction(
  _previousState: VaultActionState,
  formData: FormData,
): Promise<VaultActionState> {
  await requireVaultSession();
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");

  const actor = await getRequestActor();
  const limited = await checkUnlockLimits(actor);
  if (limited) return unlockError(limited);

  let unlockTotp: UnlockTotpSetting;
  try {
    unlockTotp = await readUnlockTotp();
  } catch {
    return unlockError(UNAVAILABLE);
  }
  if (!unlockTotp.enabled) return unlockError("Mã xác minh đang tắt.");

  const step = verifyTotpCode(unlockTotp.secret, code);
  if (!verifyVaultPassword(password) || step === null) {
    await recordFailedAttempt(actor);
    return unlockError("Chưa tắt được mã xác minh.", {
      code: "Mật khẩu hoặc mã xác minh không đúng.",
    });
  }

  try {
    if (!(await consumeUnlockTotpStep(step))) {
      return unlockError("Mã này vừa được dùng.", {
        code: "Hãy đợi mã mới rồi nhập lại.",
      });
    }
    await deleteUnlockTotp();
  } catch {
    return unlockError(UNAVAILABLE);
  }

  auditInBackground({ actorHash: actor, kind: "unlock_totp_disabled" });
  revalidatePath(getVaultAccessPath());
  return {
    message: "Đã tắt mã xác minh.",
    status: "success",
    submittedAt: Date.now(),
  };
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
    return unlockError("Tài khoản không hợp lệ.");
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
    return unlockError("Tên chưa hợp lệ.", fieldErrors);
  }

  try {
    await renameVaultEntry(id, label);
  } catch (error) {
    if (!(error instanceof VaultRenameIncompleteError)) {
      return unlockError(
        "Không thể đổi tên. Kiểm tra kết nối database và thử lại.",
      );
    }
    revalidatePath(getVaultAccessPath());
    return unlockError(
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
