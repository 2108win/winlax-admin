"use client";

import type { IScannerControls } from "@zxing/browser";
import {
  Camera,
  CircleAlert,
  FileImage,
  ImagePlus,
  KeyRound,
  Layers,
  ListPlus,
  Plus,
  ScanLine,
  X,
} from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";
import {
  useActionState,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import { createEntriesAction, createEntryAction } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  expandMigrationSource,
  isMigrationSource,
  type MigrationBatch,
} from "@/lib/vault/two-factor/migration";
import {
  MAX_IMPORT_ENTRIES,
  parseBulkImportText,
  parseTotpSource,
  prepareVaultPayload,
} from "@/lib/vault/two-factor/totp-source";
import type {
  VaultActionState,
  VaultImportInput,
  VaultPayload,
} from "@/lib/vault/two-factor/types";

const initialActionState: VaultActionState = { message: "", status: "idle" };
const MAX_QR_FILES = 20;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_BYTES = 250_000;

function SubmitButton({
  children,
  disabled,
}: {
  children: ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={disabled || pending} type="submit">
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Plus data-icon="inline-start" />
      )}
      {pending ? "Đang mã hóa…" : children}
    </Button>
  );
}

function ActionMessage({ state }: { state: VaultActionState }) {
  if (state.status === "idle") return null;
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function ManualEntryForm() {
  const [state, formAction] = useActionState(
    createEntryAction,
    initialActionState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state.status, state.submittedAt]);

  return (
    <form action={formAction} ref={formRef}>
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.issuer)}>
          <FieldLabel htmlFor="issuer">Dịch vụ</FieldLabel>
          <Input
            aria-invalid={Boolean(state.fieldErrors?.issuer)}
            autoComplete="off"
            id="issuer"
            maxLength={80}
            name="issuer"
            placeholder="GitHub"
          />
          <FieldDescription>
            Có thể để trống nếu URI đã chứa issuer.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.issuer}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.account)}>
          <FieldLabel htmlFor="account">Tài khoản</FieldLabel>
          <Input
            aria-invalid={Boolean(state.fieldErrors?.account)}
            autoComplete="off"
            id="account"
            maxLength={160}
            name="account"
            placeholder="you@example.com"
          />
          <FieldError>{state.fieldErrors?.account}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.credentialPassword)}>
          <FieldLabel htmlFor="credential-password">
            Mật khẩu tài khoản
          </FieldLabel>
          <Input
            aria-invalid={Boolean(state.fieldErrors?.credentialPassword)}
            autoComplete="new-password"
            id="credential-password"
            maxLength={4096}
            name="credentialPassword"
            placeholder="Mật khẩu đăng nhập của tài khoản"
            spellCheck={false}
            type="password"
          />
          <FieldDescription>
            Được che mặc định và mã hóa cùng thông tin 2FA.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.credentialPassword}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.website)}>
          <FieldLabel htmlFor="website">Website</FieldLabel>
          <Input
            aria-invalid={Boolean(state.fieldErrors?.website)}
            autoComplete="off"
            id="website"
            maxLength={2048}
            name="website"
            placeholder="github.com"
            type="text"
          />
          <FieldError>{state.fieldErrors?.website}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.secret)}>
          <FieldLabel htmlFor="secret">
            2FA secret hoặc URI (tùy chọn)
          </FieldLabel>
          <Input
            aria-invalid={Boolean(state.fieldErrors?.secret)}
            autoCapitalize="characters"
            autoComplete="off"
            id="secret"
            name="secret"
            placeholder="JBSWY3DPEHPK3PXP"
            spellCheck={false}
            type="password"
          />
          <FieldDescription>
            Hỗ trợ SHA-1, SHA-256, SHA-512; mã 6 hoặc 8 số.
          </FieldDescription>
          <FieldError>{state.fieldErrors?.secret}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.notes)}>
          <FieldLabel htmlFor="notes">Ghi chú riêng (tùy chọn)</FieldLabel>
          <Textarea
            aria-invalid={Boolean(state.fieldErrors?.notes)}
            id="notes"
            maxLength={5000}
            name="notes"
            placeholder="Recovery codes, lưu ý đăng nhập…"
          />
          <FieldError>{state.fieldErrors?.notes}</FieldError>
        </Field>
        <ActionMessage state={state} />
        <SubmitButton>Thêm vào vault</SubmitButton>
      </FieldGroup>
    </form>
  );
}

function ImportForm({
  children,
  disabled,
  inputs,
  onImported,
}: {
  children: ReactNode;
  disabled?: boolean;
  inputs: readonly VaultImportInput[];
  /** Called once per successful import with the entries that were sent. */
  onImported?: (imported: readonly VaultImportInput[]) => void;
}) {
  const [state, formAction] = useActionState(
    createEntriesAction,
    initialActionState,
  );
  const handledSubmission = useRef<number | undefined>(undefined);
  const submitted = useRef<readonly VaultImportInput[]>([]);

  useEffect(() => {
    if (
      state.status === "success" &&
      state.submittedAt !== handledSubmission.current
    ) {
      handledSubmission.current = state.submittedAt;
      onImported?.(submitted.current);
    }
  }, [onImported, state.status, state.submittedAt]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      onSubmit={() => {
        submitted.current = inputs;
      }}
    >
      <input name="entries" type="hidden" value={JSON.stringify(inputs)} />
      <FieldError>{state.fieldErrors?.entries}</FieldError>
      <ActionMessage state={state} />
      <SubmitButton disabled={disabled || inputs.length === 0}>
        {children}
      </SubmitButton>
    </form>
  );
}

/** One account found in a QR, editable before it is imported. */
type Candidate = Readonly<{
  account: string;
  /** Google Authenticator splits a large export over several QR codes. */
  batch?: Readonly<{ id: number; index: number; size: number }>;
  /** Set when this QR or account cannot be imported at all. */
  error?: string;
  /** The service name was worked out from a short label such as "ig". */
  guessed: boolean;
  id: string;
  issuer: string;
  /** The name the authenticator showed, or the file it came from. */
  label: string;
  origin: string;
  selected: boolean;
  source?: string;
}>;

type ExistingAccount = Readonly<{
  account: string;
  isCorrupted: boolean;
  issuer: string;
}>;

function payloadFingerprint(payload: VaultPayload) {
  return [
    payload.issuer.toLocaleLowerCase("vi"),
    payload.account.toLocaleLowerCase("vi"),
    payload.totp?.secret,
    payload.totp?.algorithm,
    payload.totp?.digits,
    payload.totp?.period,
  ].join("\u0000");
}

function accountKey(issuer: string, account: string) {
  return `${issuer.trim().toLocaleLowerCase("vi")}\u0000${account.trim().toLocaleLowerCase("vi")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Every account in one decoded QR text: a single otpauth URI or a whole Google export. */
function candidatesFromText(
  text: string,
  origin: string,
  nextId: () => string,
): Candidate[] {
  const failed = (error: unknown): Candidate[] => [
    {
      account: "",
      error: errorMessage(error, "QR này không phải mã 2FA."),
      guessed: false,
      id: nextId(),
      issuer: "",
      label: origin,
      origin,
      selected: false,
    },
  ];

  if (isMigrationSource(text)) {
    let batch: MigrationBatch;
    try {
      batch = expandMigrationSource(text);
    } catch (error) {
      return failed(error);
    }
    return batch.accounts.map((account) => ({
      account: account.input?.account ?? "",
      batch: {
        id: batch.batchId,
        index: batch.batchIndex,
        size: batch.batchSize,
      },
      error: account.error,
      guessed: account.guessed,
      id: nextId(),
      issuer: account.input?.issuer ?? "",
      label: account.label || origin,
      origin,
      selected: Boolean(account.input),
      source: account.input?.source,
    }));
  }

  try {
    const parsed = parseTotpSource(text);
    return [
      {
        account: parsed.account ?? "",
        guessed: false,
        id: nextId(),
        issuer: parsed.issuer ?? "",
        label: origin,
        origin,
        selected: true,
        source: text.trim(),
      },
    ];
  } catch (error) {
    return failed(error);
  }
}

type ReviewedCandidate = Readonly<{
  candidate: Candidate;
  existing: boolean;
  problem?: string;
  ready: boolean;
}>;

function reviewCandidates(
  candidates: readonly Candidate[],
  existingKeys: ReadonlySet<string>,
): ReviewedCandidate[] {
  const fingerprints = new Set<string>();
  return candidates.map((candidate): ReviewedCandidate => {
    const blocked = (problem: string) => ({
      candidate,
      existing: false,
      problem,
      ready: false,
    });
    if (candidate.error || !candidate.source) {
      return blocked(candidate.error ?? "QR này không phải mã 2FA.");
    }
    if (!candidate.issuer.trim()) return blocked("Nhập tên dịch vụ để thêm.");
    if (!candidate.account.trim()) return blocked("Nhập tài khoản để thêm.");

    try {
      const payload = prepareVaultPayload({
        account: candidate.account,
        issuer: candidate.issuer,
        source: candidate.source,
      });
      const fingerprint = payloadFingerprint(payload);
      if (fingerprints.has(fingerprint)) {
        return blocked("Trùng với một mục phía trên.");
      }
      fingerprints.add(fingerprint);
      return {
        candidate,
        existing: existingKeys.has(accountKey(payload.issuer, payload.account)),
        ready: true,
      };
    } catch (error) {
      return blocked(errorMessage(error, "Mã 2FA không hợp lệ."));
    }
  });
}

/** Accounts found so far in one tab, kept until they are imported or cleared. */
function useCandidates(existing: readonly ExistingAccount[]) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const counter = useRef(0);
  const existingKeys = useMemo(
    () =>
      new Set(
        existing
          .filter((entry) => !entry.isCorrupted)
          .map((entry) => accountKey(entry.issuer, entry.account)),
      ),
    [existing],
  );

  const nextId = useCallback(() => {
    counter.current += 1;
    return `candidate-${counter.current}`;
  }, []);

  /** Adds new accounts, skipping any QR already in the list. Returns how many were skipped. */
  const add = (incoming: readonly Candidate[]) => {
    const sources = new Set(
      candidates.flatMap((candidate) =>
        candidate.source ? [candidate.source] : [],
      ),
    );
    const fresh = incoming
      .filter((candidate) => {
        if (!candidate.source) return true;
        if (sources.has(candidate.source)) return false;
        sources.add(candidate.source);
        return true;
      })
      .map((candidate) =>
        // Already in the vault: shown, but left unticked so it is not saved twice.
        candidate.selected &&
        existingKeys.has(accountKey(candidate.issuer, candidate.account))
          ? { ...candidate, selected: false }
          : candidate,
      );
    setCandidates((current) => [...current, ...fresh]);
    return incoming.length - fresh.length;
  };

  const update = useCallback((id: string, patch: Partial<Candidate>) => {
    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === id ? { ...candidate, ...patch } : candidate,
      ),
    );
  }, []);

  const removeImported = useCallback(
    (imported: readonly VaultImportInput[]) => {
      const sent = new Set(imported.map((input) => input.source));
      setCandidates((current) =>
        current.filter(
          (candidate) => !candidate.source || !sent.has(candidate.source),
        ),
      );
    },
    [],
  );

  const clear = useCallback(() => setCandidates([]), []);

  return {
    add,
    candidates,
    clear,
    existingKeys,
    nextId,
    removeImported,
    setCandidates,
    update,
  };
}

/** "Part 1 of 3" notice for Google exports that span several QR codes. */
function missingBatchParts(candidates: readonly Candidate[]) {
  const batches = new Map<number, { seen: Set<number>; size: number }>();
  for (const { batch } of candidates) {
    if (!batch || batch.size < 2) continue;
    const entry = batches.get(batch.id) ?? {
      seen: new Set(),
      size: batch.size,
    };
    entry.seen.add(batch.index);
    batches.set(batch.id, entry);
  }
  return [...batches.values()].filter((batch) => batch.seen.size < batch.size);
}

function CandidateRow({
  onChange,
  review,
}: {
  onChange: (id: string, patch: Partial<Candidate>) => void;
  review: ReviewedCandidate;
}) {
  const { candidate, existing, problem, ready } = review;
  const editable = Boolean(candidate.source && !candidate.error);
  const missingIssuer = editable && !candidate.issuer.trim();
  const missingAccount = editable && !candidate.account.trim();
  const name = candidate.issuer || candidate.account || candidate.label;

  let note: ReactNode = (
    <span className="text-muted-foreground">{candidate.origin}</span>
  );
  if (problem) {
    note = <span className="text-destructive">{problem}</span>;
  } else if (existing) {
    note = (
      <span className="text-amber">
        Đã có trong vault, chỉ tick nếu muốn lưu thêm bản nữa.
      </span>
    );
  } else if (candidate.guessed) {
    note = (
      <span className="text-muted-foreground">
        Tên dịch vụ được đoán từ “{candidate.label}”, sửa nếu chưa đúng.
      </span>
    );
  }

  return (
    <li
      className="bg-muted/40 flex items-start gap-2 rounded-lg border p-2.5 text-sm"
      data-ready={ready}
    >
      {editable ? (
        <label className="-m-1 grid size-9 shrink-0 cursor-pointer place-items-center">
          <input
            aria-label={`Chọn ${name}`}
            checked={ready && candidate.selected}
            className="size-4 accent-current"
            disabled={!ready}
            onChange={(event) =>
              onChange(candidate.id, { selected: event.target.checked })
            }
            type="checkbox"
          />
        </label>
      ) : (
        <CircleAlert
          aria-hidden="true"
          className="text-destructive mt-0.5 size-4 shrink-0"
        />
      )}
      <div className="@container flex min-w-0 flex-1 flex-col gap-1.5">
        {editable ? (
          // Side by side only where an email address still fits.
          <div className="grid gap-1.5 @sm:grid-cols-2">
            <Input
              aria-invalid={missingIssuer}
              aria-label={`Dịch vụ của ${candidate.label}`}
              autoComplete="off"
              className="h-9 px-2.5 text-sm"
              maxLength={80}
              onChange={(event) =>
                onChange(candidate.id, {
                  guessed: false,
                  issuer: event.target.value,
                  selected: true,
                })
              }
              placeholder="Dịch vụ"
              value={candidate.issuer}
            />
            <Input
              aria-invalid={missingAccount}
              aria-label={`Tài khoản của ${candidate.label}`}
              autoComplete="off"
              className="h-9 px-2.5 text-sm"
              maxLength={160}
              onChange={(event) =>
                onChange(candidate.id, {
                  account: event.target.value,
                  selected: true,
                })
              }
              placeholder="Tài khoản"
              value={candidate.account}
            />
          </div>
        ) : (
          <p className="truncate font-medium">{candidate.label}</p>
        )}
        <p className="text-xs leading-5">{note}</p>
      </div>
    </li>
  );
}

function CandidateReview({
  candidates,
  existingKeys,
  onClear,
  onImported,
  setCandidates,
  update,
}: Pick<
  ReturnType<typeof useCandidates>,
  "candidates" | "existingKeys" | "setCandidates" | "update"
> & {
  onClear: () => void;
  onImported: (imported: readonly VaultImportInput[]) => void;
}) {
  const reviews = reviewCandidates(candidates, existingKeys);
  const ready = reviews.filter((review) => review.ready);
  const selected = ready.filter((review) => review.candidate.selected);
  const needsInput = reviews.filter(
    (review) => !review.ready && review.candidate.source,
  ).length;
  const inputs = selected.map(({ candidate }) => ({
    account: candidate.account.trim(),
    issuer: candidate.issuer.trim(),
    source: candidate.source!,
  }));
  const missingParts = missingBatchParts(candidates);
  const allSelected = ready.length > 0 && selected.length === ready.length;

  if (candidates.length === 0) return null;

  const toggleAll = () => {
    const readyIds = new Set(ready.map((review) => review.candidate.id));
    setCandidates((current) =>
      current.map((candidate) =>
        readyIds.has(candidate.id)
          ? { ...candidate, selected: !allSelected }
          : candidate,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm font-medium">
          {ready.length + needsInput > 0
            ? `Tìm thấy ${ready.length + needsInput} tài khoản · đã chọn ${selected.length}`
            : "Chưa có tài khoản nào dùng được"}
        </p>
        <div className="flex gap-1">
          {ready.length > 0 ? (
            <Button onClick={toggleAll} size="sm" type="button" variant="ghost">
              {allSelected ? "Bỏ chọn hết" : "Chọn hết"}
            </Button>
          ) : null}
          <Button onClick={onClear} size="sm" type="button" variant="ghost">
            <X data-icon="inline-start" />
            Xóa danh sách
          </Button>
        </div>
      </div>
      {missingParts.map((batch) => (
        <Alert key={batch.size + "-" + [...batch.seen].join(",")}>
          <Layers aria-hidden="true" />
          <AlertDescription>
            Bản xuất Google Authenticator này gồm {batch.size} mã QR, mới đọc{" "}
            {batch.seen.size}. Thêm ảnh của các QR còn lại để lấy đủ tài khoản.
          </AlertDescription>
        </Alert>
      ))}
      {needsInput > 0 ? (
        <p className="text-muted-foreground text-xs leading-5">
          {needsInput} tài khoản thiếu tên dịch vụ hoặc tài khoản: điền vào ô
          trống để thêm cùng lúc.
        </p>
      ) : null}
      <ul
        aria-label="Tài khoản tìm thấy trong QR"
        className="flex flex-col gap-2"
      >
        {reviews.map((review) => (
          <CandidateRow
            key={review.candidate.id}
            onChange={update}
            review={review}
          />
        ))}
      </ul>
      {inputs.length > MAX_IMPORT_ENTRIES ? (
        <p className="text-destructive text-sm">
          Mỗi lần chỉ thêm tối đa {MAX_IMPORT_ENTRIES} tài khoản. Hãy bỏ chọn
          bớt.
        </p>
      ) : null}
      <ImportForm
        disabled={inputs.length > MAX_IMPORT_ENTRIES}
        inputs={inputs}
        onImported={onImported}
      >
        {inputs.length > 0
          ? `Thêm ${inputs.length} tài khoản vào vault`
          : "Chọn tài khoản để thêm"}
      </ImportForm>
    </div>
  );
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect(source: ImageBitmapSource): Promise<{ rawValue: string }[]>;
};

function drawForDecoding(
  bitmap: ImageBitmap,
  maxSide: number,
  invert: boolean,
) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not available.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (invert) {
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      image.data[index] = 255 - image.data[index];
      image.data[index + 1] = 255 - image.data[index + 1];
      image.data[index + 2] = 255 - image.data[index + 2];
    }
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

/**
 * Every QR text in an image. The browser's own detector finds several codes in one screenshot;
 * otherwise ZXing tries the image at full and reduced size, and inverted for dark-mode QR codes.
 */
async function readQrTexts(file: File): Promise<string[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const Detector = (
      globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (Detector) {
      try {
        const codes = await new Detector({ formats: ["qr_code"] }).detect(
          bitmap,
        );
        const texts = [
          ...new Set(codes.map((code) => code.rawValue).filter(Boolean)),
        ];
        if (texts.length > 0) return texts;
      } catch {
        // Fall back to ZXing below.
      }
    }

    const [{ BrowserQRCodeReader }, { DecodeHintType }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const reader = new BrowserQRCodeReader(
      new Map([[DecodeHintType.TRY_HARDER, true]]),
    );
    const tried = new Set<number>();
    for (const maxSide of [2400, 1200]) {
      const side = Math.min(maxSide, Math.max(bitmap.width, bitmap.height));
      if (tried.has(side)) continue;
      tried.add(side);
      for (const invert of [false, true]) {
        try {
          return [
            reader
              .decodeFromCanvas(drawForDecoding(bitmap, maxSide, invert))
              .getText(),
          ];
        } catch {
          // Try the next size or the inverted image.
        }
      }
    }
    return [];
  } finally {
    bitmap.close();
  }
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement)
  );
}

function ImageImport({ existing }: { existing: readonly ExistingAccount[] }) {
  const review = useCandidates(existing);
  const [progress, setProgress] = useState<string>("");
  const [notice, setNotice] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLLabelElement>(null);
  const isReading = Boolean(progress);

  const addFiles = async (files: readonly File[], pasted = false) => {
    setNotice("");
    if (files.length === 0 || isReading) return;
    if (files.length > MAX_QR_FILES) {
      setNotice(`Mỗi lần chọn tối đa ${MAX_QR_FILES} ảnh QR.`);
      return;
    }

    const found: Candidate[] = [];
    for (const [index, file] of files.entries()) {
      const origin = pasted ? "Ảnh đã dán" : file.name;
      const fail = (error: string) =>
        found.push({
          account: "",
          error,
          guessed: false,
          id: review.nextId(),
          issuer: "",
          label: origin,
          origin,
          selected: false,
        });
      setProgress(
        files.length > 1
          ? `Đang đọc ảnh ${index + 1}/${files.length}…`
          : "Đang đọc mã QR…",
      );
      if (!file.type.startsWith("image/")) {
        fail("Tệp này không phải là ảnh.");
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        fail("Ảnh vượt quá 10 MB.");
        continue;
      }

      let texts: string[];
      try {
        texts = await readQrTexts(file);
      } catch {
        fail("Không mở được ảnh này. Hãy dùng ảnh PNG hoặc JPG.");
        continue;
      }
      if (texts.length === 0) {
        fail(
          "Không tìm thấy mã QR rõ nét. Hãy chụp màn hình lại hoặc cắt sát vùng QR.",
        );
        continue;
      }
      for (const text of texts) {
        found.push(...candidatesFromText(text, origin, review.nextId));
      }
    }

    const skipped = review.add(found);
    if (skipped > 0) {
      setNotice(`Bỏ qua ${skipped} tài khoản đã có trong danh sách.`);
    }
    setProgress("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addText = (text: string) => {
    setNotice("");
    const skipped = review.add(
      candidatesFromText(text, "Nội dung đã dán", review.nextId),
    );
    if (skipped > 0) setNotice("Mã này đã có trong danh sách.");
  };

  // ⌘V / Ctrl+V anywhere on the page while this tab is showing: a screenshot or an otpauth link.
  const onPaste = useEffectEvent((event: ClipboardEvent) => {
    // Mounted but hidden while another vault tab is open.
    if (!dropzoneRef.current?.getClientRects().length) return;
    const images = Array.from(event.clipboardData?.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (images.length > 0) {
      event.preventDefault();
      void addFiles(images, true);
      return;
    }
    const text = event.clipboardData?.getData("text/plain").trim() ?? "";
    if (
      !isEditableTarget(event.target) &&
      /^otpauth(-migration)?:\/\//iu.test(text)
    ) {
      event.preventDefault();
      addText(text);
    }
  });

  useEffect(() => {
    const listener = (event: ClipboardEvent) => onPaste(event);
    document.addEventListener("paste", listener);
    return () => document.removeEventListener("paste", listener);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <label
          className="border-input hover:bg-muted/40 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-ring/50 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors has-[input:focus-visible]:ring-[3px] data-[dragging=true]:border-[var(--brand-orange)] data-[dragging=true]:bg-[var(--brand-orange)]/5"
          data-dragging={isDragging}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void addFiles(Array.from(event.dataTransfer.files));
          }}
          ref={dropzoneRef}
        >
          {isReading ? (
            <Spinner className="size-6" />
          ) : (
            <ImagePlus
              aria-hidden="true"
              className="text-muted-foreground size-7"
            />
          )}
          <span className="text-sm font-medium">
            {progress || "Chọn, kéo thả hoặc dán ảnh QR"}
          </span>
          <span className="text-muted-foreground text-xs leading-5">
            Ảnh chụp màn hình QR 2FA hoặc QR “Chuyển tài khoản” của Google
            Authenticator. Có thể chọn nhiều ảnh, nhấn ⌘V / Ctrl+V để dán.
          </span>
          <input
            accept="image/*"
            className="sr-only"
            disabled={isReading}
            id="qr-images"
            multiple
            onChange={(event) =>
              void addFiles(Array.from(event.target.files ?? []))
            }
            ref={fileInputRef}
            type="file"
          />
        </label>
        <FieldDescription>
          Ảnh được đọc ngay trong trình duyệt, không tải lên máy chủ. Tối đa{" "}
          {MAX_QR_FILES} ảnh, mỗi ảnh 10 MB.
        </FieldDescription>
        {notice ? (
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {notice}
          </p>
        ) : null}
      </Field>
      <CandidateReview
        candidates={review.candidates}
        existingKeys={review.existingKeys}
        onClear={() => {
          review.clear();
          setNotice("");
        }}
        onImported={(imported) => {
          review.removeImported(imported);
          setNotice(
            `Đã mã hóa và thêm ${imported.length} tài khoản vào vault.`,
          );
        }}
        setCandidates={review.setCandidates}
        update={review.update}
      />
    </div>
  );
}

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Quyền camera đã bị từ chối. Hãy cho phép camera trong cài đặt trình duyệt, hoặc dùng tab Ảnh QR.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Không tìm thấy camera. Bạn có thể tải ảnh QR lên thay thế.";
  }
  return "Không thể mở camera. Hãy kiểm tra quyền truy cập hoặc dùng ảnh QR.";
}

function CameraImport({ existing }: { existing: readonly ExistingAccount[] }) {
  const review = useCandidates(existing);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [status, setStatus] = useState<"idle" | "starting" | "scanning">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const onScanned = (text: string) => {
    const skipped = review.add(
      candidatesFromText(text, "QR vừa quét", review.nextId),
    );
    setNotice(skipped > 0 ? "Mã này đã có trong danh sách." : "");
  };

  const startCamera = async () => {
    setErrorMessage("");
    setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage(
        "Trình duyệt này không hỗ trợ camera. Hãy dùng tab Ảnh QR.",
      );
      return;
    }
    if (!videoRef.current) return;

    setStatus("starting");
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader(undefined, {
        delayBetweenScanAttempts: 250,
      });
      // The back camera on phones; laptops simply use their only camera.
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _error, scannerControls) => {
          if (!result) return;
          scannerControls.stop();
          controlsRef.current = null;
          setStatus("idle");
          onScanned(result.getText());
        },
      );
      controlsRef.current = controls;
      setStatus("scanning");
    } catch (error) {
      stopCamera();
      setErrorMessage(cameraErrorMessage(error));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-muted relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border">
        <video
          aria-label="Hình ảnh camera để quét QR"
          className="size-full object-cover"
          muted
          playsInline
          ref={videoRef}
        />
        {status === "idle" ? (
          <div className="bg-background/85 absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center backdrop-blur-sm">
            <ScanLine
              aria-hidden="true"
              className="text-muted-foreground size-10"
            />
            <p className="text-muted-foreground text-sm leading-5">
              {review.candidates.length > 0
                ? "Đã đọc xong. Quét thêm nếu còn mã QR khác."
                : "Camera chỉ mở sau khi bạn nhấn nút bên dưới."}
            </p>
          </div>
        ) : null}
      </div>
      {status === "scanning" ? (
        <Button onClick={stopCamera} type="button" variant="outline">
          Dừng camera
        </Button>
      ) : (
        <Button
          disabled={status === "starting"}
          onClick={startCamera}
          type="button"
          variant={review.candidates.length > 0 ? "outline" : "default"}
        >
          {status === "starting" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Camera data-icon="inline-start" />
          )}
          {status === "starting"
            ? "Đang mở camera…"
            : review.candidates.length > 0
              ? "Quét thêm mã QR"
              : "Mở camera và quét"}
        </Button>
      )}
      {errorMessage ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {notice}
        </p>
      ) : null}
      <CandidateReview
        candidates={review.candidates}
        existingKeys={review.existingKeys}
        onClear={review.clear}
        onImported={(imported) => {
          review.removeImported(imported);
          setNotice(
            `Đã mã hóa và thêm ${imported.length} tài khoản vào vault.`,
          );
        }}
        setCandidates={review.setCandidates}
        update={review.update}
      />
    </div>
  );
}

function BulkImport() {
  const [value, setValue] = useState("");
  const [fileError, setFileError] = useState("");
  const rows = useMemo(() => parseBulkImportText(value), [value]);
  const validRows = rows.filter(
    (
      row,
    ): row is typeof row & { input: VaultImportInput; payload: VaultPayload } =>
      Boolean(row.input && row.payload),
  );
  const errorRows = rows.filter((row) => row.error);
  const inputs = validRows.map((row) => row.input);

  const loadTextFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFileError("");
    if (!file) return;
    if (file.size > MAX_TEXT_BYTES) {
      setFileError("Tệp vượt quá 250 KB.");
      event.target.value = "";
      return;
    }
    try {
      setValue(await file.text());
    } catch {
      setFileError("Không thể đọc tệp này.");
    }
  };

  const clearText = useCallback(() => setValue(""), []);

  return (
    <div className="flex flex-col gap-4">
      <Field data-invalid={Boolean(errorRows.length)}>
        <FieldLabel htmlFor="bulk-entries">Danh sách 2FA</FieldLabel>
        <Textarea
          aria-invalid={Boolean(errorRows.length)}
          className="min-h-44 font-mono text-xs"
          id="bulk-entries"
          onChange={(event) => setValue(event.target.value)}
          placeholder={
            "otpauth://totp/GitHub:user@example.com?secret=…\nGoogle | user@example.com | JBSWY3DPEHPK3PXP"
          }
          spellCheck={false}
          value={value}
        />
        <FieldDescription>
          Mỗi dòng là một URI <code>otpauth://</code> (kể cả link chuyển tài
          khoản <code>otpauth-migration://</code>), hoặc: dịch vụ | tài khoản |
          secret. Tối đa {MAX_IMPORT_ENTRIES} mã.
        </FieldDescription>
      </Field>
      <Field data-invalid={Boolean(fileError)}>
        <FieldLabel htmlFor="bulk-file">Hoặc tải tệp .txt/.csv</FieldLabel>
        <Input
          accept=".txt,.csv,text/plain,text/csv"
          id="bulk-file"
          onChange={loadTextFile}
          type="file"
        />
        <FieldError>{fileError}</FieldError>
      </Field>
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-live="polite">
          <Badge variant="secondary">{validRows.length} hợp lệ</Badge>
          {errorRows.length > 0 ? (
            <Badge variant="destructive">{errorRows.length} cần sửa</Badge>
          ) : null}
        </div>
      ) : null}
      {errorRows.length > 0 ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {errorRows.slice(0, 5).map((row) => (
                <li key={`${row.lineNumber}-${row.label ?? ""}`}>
                  Dòng {row.lineNumber}
                  {row.label ? ` (${row.label})` : ""}: {row.error}
                </li>
              ))}
              {errorRows.length > 5 ? (
                <li>Và {errorRows.length - 5} lỗi khác.</li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <ImportForm
        disabled={errorRows.length > 0}
        inputs={inputs}
        onImported={clearText}
      >
        Nhập {inputs.length} mã cùng lúc
      </ImportForm>
    </div>
  );
}

/** "Thêm tài khoản" button that opens the add/import forms in a modal dialog. */
export function AddAccountDialog({
  existing,
}: {
  /** Accounts already in the vault, so a QR import can flag them. */
  existing: readonly ExistingAccount[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // The forms only exist while the dialog is open: closing it stops the camera and clears them.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <Plus data-icon="inline-start" />
        Thêm tài khoản
      </Button>
      <dialog
        aria-labelledby="vault-add-title"
        className="vault-dialog"
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) setOpen(false);
        }}
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        {open ? (
          <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold" id="vault-add-title">
                  Thêm tài khoản
                </h2>
                <p className="mt-0.5 text-sm text-white/50">
                  Nhập tay, hoặc quét QR từ ảnh, camera hay danh sách otpauth://.
                </p>
              </div>
              <button
                aria-label="Đóng"
                className="vault-icon-button -mt-1 -mr-2"
                onClick={() => setOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4">
              <Tabs defaultValue="manual">
                <TabsList className="vault-tabs-list">
                  <TabsTrigger value="manual">
                    <KeyRound aria-hidden="true" className="size-4" />
                    Thủ công
                  </TabsTrigger>
                  <TabsTrigger value="image">
                    <FileImage aria-hidden="true" className="size-4" />
                    Ảnh QR
                  </TabsTrigger>
                  <TabsTrigger value="camera">
                    <Camera aria-hidden="true" className="size-4" />
                    Camera
                  </TabsTrigger>
                  <TabsTrigger value="bulk">
                    <ListPlus aria-hidden="true" className="size-4" />
                    Hàng loạt
                  </TabsTrigger>
                </TabsList>
                <TabsContent className="mt-4" value="manual">
                  <ManualEntryForm />
                </TabsContent>
                <TabsContent className="mt-4" value="image">
                  <ImageImport existing={existing} />
                </TabsContent>
                <TabsContent className="mt-4" value="camera">
                  <CameraImport existing={existing} />
                </TabsContent>
                <TabsContent className="mt-4" value="bulk">
                  <BulkImport />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
