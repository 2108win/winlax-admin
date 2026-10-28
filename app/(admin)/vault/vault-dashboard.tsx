"use client";

import {
  Check,
  Clipboard,
  Clock3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Inbox,
  KeyRound,
  Lock,
  LockKeyhole,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";

import {
  deleteEntryAction,
  lockEverywhereAction,
  lockVaultAction,
  renameEntryAction,
  revealEntryDetailsAction,
} from "./actions";
import { BackupButton } from "./backup-button";
import {
  SECRET_CLIPBOARD_SECONDS,
  clearSecretNow,
  copySecret,
  copyText,
} from "./secret-clipboard";
import { SecurityPanel } from "./security-panel";
import { useIdleLock } from "./use-idle-lock";
import { VaultChrome } from "./vault-chrome";
import { ImportPanel } from "./import-panel";
import { MessagesPanel } from "./messages-panel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ContactMessage } from "@/lib/vault/contact/repository";
import type {
  VaultActionState,
  VaultEntryView,
  VaultRevealState,
} from "@/lib/vault/two-factor/types";

const initialRevealState: VaultRevealState = { message: "", status: "idle" };
const initialRenameState: VaultActionState = { message: "", status: "idle" };

function RevealButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      className="min-h-11 w-full"
      disabled={pending}
      type="submit"
      variant="outline"
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Eye data-icon="inline-start" />
      )}
      {pending ? "Đang giải mã…" : "Mở thông tin riêng"}
    </Button>
  );
}

function PrivateDetails({ entry }: { entry: VaultEntryView }) {
  const [state, formAction] = useActionState(
    revealEntryDetailsAction,
    initialRevealState,
  );
  const [isVisible, setIsVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (state.status !== "success" || !state.details?.password) return;
    const timer = window.setTimeout(() => setIsVisible(false), 30_000);
    return () => window.clearTimeout(timer);
  }, [state.details?.password, state.status]);

  const copyPassword = async () => {
    if (!state.details?.password) return;
    try {
      await copySecret(state.details.password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  if (state.status !== "success" || !state.details) {
    return (
      <div className="flex flex-col gap-3">
        <form action={formAction}>
          <input name="id" type="hidden" value={entry.id} />
          <RevealButton />
        </form>
        {state.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.details.password ? (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <LockKeyhole aria-hidden="true" />
            Mật khẩu
          </div>
          <div className="bg-muted/40 flex min-h-14 items-center gap-2 rounded-lg border p-2 pl-3">
            <code className="min-w-0 flex-1 text-sm break-all">
              {isVisible ? state.details.password : "••••••••••••"}
            </code>
            <Button
              aria-label={isVisible ? "Che mật khẩu" : "Hiện mật khẩu"}
              className="size-11 shrink-0"
              onClick={() => setIsVisible((visible) => !visible)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isVisible ? (
                <EyeOff aria-hidden="true" />
              ) : (
                <Eye aria-hidden="true" />
              )}
            </Button>
            <Button
              aria-label="Sao chép mật khẩu"
              className="size-11 shrink-0"
              onClick={copyPassword}
              size="icon"
              type="button"
              variant="ghost"
            >
              {copied ? (
                <Check aria-hidden="true" />
              ) : (
                <Clipboard aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      ) : null}
      {state.details.notes ? (
        <div className="flex flex-col gap-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <FileText aria-hidden="true" />
            Ghi chú riêng
          </div>
          <p className="bg-muted/40 rounded-lg border p-3 text-sm leading-6 break-words whitespace-pre-wrap">
            {state.details.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DeleteEntryButton({ entry }: { entry: VaultEntryView }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          aria-label={`Xóa ${entry.issuer}`}
          className="vault-icon-button hover:text-destructive"
          title="Xóa tài khoản"
          type="button"
        >
          <Trash2 aria-hidden="true" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa tài khoản {entry.issuer}?</AlertDialogTitle>
          <AlertDialogDescription>
            Bản ghi được mã hóa sẽ bị xóa vĩnh viễn khỏi database. Hành động này
            không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Giữ lại</AlertDialogCancel>
          <form action={deleteEntryAction}>
            <input name="id" type="hidden" value={entry.id} />
            <AlertDialogAction asChild>
              <Button className="w-full" type="submit" variant="destructive">
                <Trash2 data-icon="inline-start" />
                Xóa tài khoản
              </Button>
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RenameButton() {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} size="sm" type="submit">
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Check data-icon="inline-start" />
      )}
      {pending ? "Đang lưu…" : "Lưu"}
    </Button>
  );
}

/** Edits the service name and account in place; the secret, password and notes stay as they are. */
function RenameForm({
  entry,
  onDone,
  onRenamed,
}: {
  entry: VaultEntryView;
  onDone: () => void;
  /** Told here, not from an effect: the renamed entry replaces this card in the same render. */
  onRenamed: (message: string) => void;
}) {
  const [state, formAction] = useActionState(
    async (previousState: VaultActionState, formData: FormData) => {
      const result = await renameEntryAction(previousState, formData);
      if (result.status === "success") onRenamed(result.message);
      return result;
    },
    initialRenameState,
  );
  // Controlled, so a rejected name is kept for fixing instead of being reset by the form.
  const [issuer, setIssuer] = useState(entry.issuer);
  const [account, setAccount] = useState(entry.account);
  const issuerRef = useRef<HTMLInputElement>(null);
  const issuerError = state.fieldErrors?.issuer;
  const accountError = state.fieldErrors?.account;

  useEffect(() => issuerRef.current?.select(), []);

  // A successful rename replaces this entry when the list refreshes; close the form meanwhile.
  useEffect(() => {
    if (state.status === "success") onDone();
  }, [onDone, state.status, state.submittedAt]);

  const cancelOnEscape = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") onDone();
  };

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-2">
      <input name="id" type="hidden" value={entry.id} />
      <Input
        aria-describedby={issuerError ? `${entry.id}-issuer-error` : undefined}
        aria-invalid={Boolean(issuerError)}
        aria-label="Tên dịch vụ"
        autoComplete="off"
        className="h-9"
        maxLength={80}
        name="issuer"
        onChange={(event) => setIssuer(event.target.value)}
        onKeyDown={cancelOnEscape}
        placeholder="Tên dịch vụ"
        ref={issuerRef}
        value={issuer}
      />
      {issuerError ? (
        <p className="text-destructive text-xs" id={`${entry.id}-issuer-error`}>
          {issuerError}
        </p>
      ) : null}
      <Input
        aria-describedby={
          accountError ? `${entry.id}-account-error` : undefined
        }
        aria-invalid={Boolean(accountError)}
        aria-label="Tài khoản"
        autoComplete="off"
        className="h-9"
        maxLength={160}
        name="account"
        onChange={(event) => setAccount(event.target.value)}
        onKeyDown={cancelOnEscape}
        placeholder="Tài khoản"
        spellCheck={false}
        value={account}
      />
      {accountError ? (
        <p
          className="text-destructive text-xs"
          id={`${entry.id}-account-error`}
        >
          {accountError}
        </p>
      ) : null}
      {state.status === "error" && !issuerError && !accountError ? (
        <p className="text-destructive text-xs" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <RenameButton />
        <Button onClick={onDone} size="sm" type="button" variant="ghost">
          Hủy
        </Button>
      </div>
    </form>
  );
}

/** A stable colour for each service, from the site's palette. */
function monogramTone(issuer: string): number {
  let hash = 0;
  for (const character of issuer.toLowerCase()) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash % 6;
}

function CodeRing({
  period,
  secondsRemaining,
}: {
  period: number;
  secondsRemaining: number;
}) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - secondsRemaining / period);

  return (
    <div
      aria-label={`Còn ${secondsRemaining} giây trước khi mã đổi`}
      aria-valuemax={period}
      aria-valuemin={0}
      aria-valuenow={secondsRemaining}
      className="vault-ring"
      data-ending={secondsRemaining <= 5}
      role="progressbar"
    >
      <svg aria-hidden="true" viewBox="0 0 44 44">
        <circle
          className="vault-ring-track"
          cx="22"
          cy="22"
          fill="none"
          r={radius}
          strokeWidth="3"
        />
        <circle
          className="vault-ring-value"
          cx="22"
          cy="22"
          fill="none"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      <span aria-hidden="true">{secondsRemaining}</span>
    </div>
  );
}

function CredentialCard({
  entry,
  now,
  onCopy,
  onRenamed,
  wasCopied,
}: {
  entry: VaultEntryView;
  now: number;
  onCopy: (entry: VaultEntryView) => void;
  onRenamed: (message: string) => void;
  wasCopied: boolean;
}) {
  const hasActiveTotp = Boolean(
    entry.hasTotp &&
    entry.currentCode &&
    entry.nextCode &&
    entry.expiresAt &&
    entry.period,
  );
  const secondsRemaining = hasActiveTotp
    ? Math.max(0, Math.ceil((entry.expiresAt! - now) / 1000))
    : 0;
  const codeGroupSize = entry.currentCode?.length === 8 ? 4 : 3;
  const groupedCode = entry.currentCode
    ? `${entry.currentCode.slice(0, codeGroupSize)} ${entry.currentCode.slice(codeGroupSize)}`
    : "";
  const initial = Array.from(entry.issuer.trim())[0]?.toUpperCase() ?? "?";
  const [isRenaming, setIsRenaming] = useState(false);
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const stopRenaming = useCallback(() => {
    setIsRenaming(false);
    // Back to the button that opened the form, so the keyboard keeps its place.
    window.requestAnimationFrame(() => renameButtonRef.current?.focus());
  }, []);

  return (
    <article
      aria-label={`${entry.issuer}, ${entry.account}`}
      className="vault-card"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="vault-monogram"
          data-tone={monogramTone(entry.issuer)}
        >
          {initial}
        </span>
        {isRenaming ? (
          <RenameForm
            entry={entry}
            onDone={stopRenaming}
            onRenamed={onRenamed}
          />
        ) : (
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="font-display truncate text-base font-medium">
              {entry.issuer}
            </h3>
            <p className="text-muted-foreground truncate text-sm">
              {entry.account}
            </p>
          </div>
        )}
        <div className="-mt-1 -mr-2 flex shrink-0" hidden={isRenaming}>
          {entry.isCorrupted ? null : (
            <button
              aria-label={`Sao chép tài khoản ${entry.account}`}
              className="vault-icon-button"
              onClick={() => void copyText(entry.account).catch(() => {})}
              title="Sao chép tài khoản"
              type="button"
            >
              <UserRound aria-hidden="true" />
            </button>
          )}
          {entry.website && !entry.isCorrupted ? (
            <a
              aria-label={`Mở website của ${entry.issuer}`}
              className="vault-icon-button"
              href={entry.website}
              rel="noreferrer"
              target="_blank"
              title="Mở website"
            >
              <ExternalLink aria-hidden="true" />
            </a>
          ) : null}
          <DeleteEntryButton entry={entry} />
        </div>
      </div>

      {entry.isCorrupted ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden="true" />
          <AlertDescription>
            Không thể giải mã bản ghi này bằng khóa hiện tại. Bạn vẫn có thể xóa
            nó.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {hasActiveTotp ? (
            <div className="flex items-center gap-3">
              <button
                aria-label={`Sao chép mã ${entry.currentCode} của ${entry.issuer}`}
                className="vault-code"
                onClick={() => onCopy(entry)}
                type="button"
              >
                <span className="vault-code-digits">{groupedCode}</span>
                {wasCopied ? (
                  <Check aria-hidden="true" className="size-5 shrink-0" />
                ) : (
                  <Clipboard
                    aria-hidden="true"
                    className="text-muted-foreground size-5 shrink-0"
                  />
                )}
              </button>
              <CodeRing
                period={entry.period!}
                secondsRemaining={secondsRemaining}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            {entry.hasPassword ? (
              <Badge variant="secondary">Mật khẩu</Badge>
            ) : null}
            {entry.hasTotp ? <Badge variant="secondary">2FA</Badge> : null}
            {entry.hasNotes ? <Badge variant="outline">Ghi chú</Badge> : null}
            {isRenaming ? null : (
              <Button
                aria-label={`Sửa tên ${entry.issuer}`}
                className="text-muted-foreground -my-1 -mr-2 ml-auto"
                onClick={() => setIsRenaming(true)}
                ref={renameButtonRef}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Pencil data-icon="inline-start" />
                Sửa tên
              </Button>
            )}
          </div>
          {entry.hasPassword || entry.hasNotes ? (
            <PrivateDetails entry={entry} />
          ) : null}
        </>
      )}
    </article>
  );
}

type VaultTab = "accounts" | "inbox" | "security";

const tabPanel = "mt-6 data-[state=inactive]:hidden";

function matches(entry: VaultEntryView, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase("vi");
  if (!needle) return true;
  return [entry.issuer, entry.account, entry.website ?? ""].some((value) =>
    value.toLocaleLowerCase("vi").includes(needle),
  );
}

function SessionsCard({
  activeSessions,
  idleMinutes,
}: {
  activeSessions: number | null;
  idleMinutes: number;
}) {
  return (
    <aside
      aria-labelledby="vault-sessions-title"
      className="vault-card h-fit gap-4"
    >
      <h2 className="font-display text-xl" id="vault-sessions-title">
        Phiên đăng nhập
      </h2>
      <dl className="grid gap-3 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Đang mở</dt>
          <dd className="font-medium">
            {activeSessions === null
              ? "Không đọc được"
              : `${activeSessions} phiên`}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Tự khóa</dt>
          <dd className="font-medium">Sau {idleMinutes} phút không thao tác</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-muted-foreground">Hết hạn</dt>
          <dd className="font-medium">Tối đa 8 giờ</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs leading-5">
        Dùng “Khóa ở mọi nơi” ở đầu trang để đăng xuất mọi trình duyệt ngay lập
        tức. Nhớ tải bản sao lưu sau khi thêm nhiều tài khoản.
      </p>
    </aside>
  );
}

export function VaultDashboard({
  activeSessions,
  idleSeconds,
  initialEntries,
  initialMessages,
  messagesFailed,
  renderedAt,
  shortPassword,
  unlockTotpEnabled,
}: {
  /** Browsers signed in right now, or null when the count could not be read. */
  activeSessions: number | null;
  idleSeconds: number;
  initialEntries: VaultEntryView[];
  initialMessages: readonly ContactMessage[];
  messagesFailed: boolean;
  /** Server time of this render, so the first client render shows the same countdown. */
  renderedAt: number;
  /** The vault password is shorter than recommended. */
  shortPassword: boolean;
  unlockTotpEnabled: boolean;
}) {
  const router = useRouter();
  useIdleLock(idleSeconds);
  const [now, setNow] = useState(renderedAt);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState("");
  const [tab, setTab] = useState<VaultTab>("accounts");
  const [query, setQuery] = useState("");
  const lastRefreshAt = useRef(0);
  const idleMinutes = Math.round(idleSeconds / 60);
  const entries = initialEntries.map((entry) =>
    !entry.isCorrupted && entry.expiresAt && now >= entry.expiresAt
      ? {
          ...entry,
          currentCode: entry.nextCode,
          expiresAt: entry.expiresAt + (entry.period ?? 30) * 1_000,
        }
      : entry,
  );
  const visibleEntries = entries.filter((entry) => matches(entry, query));
  const newMessages = initialMessages.filter(
    (message) => message.status === "new",
  ).length;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const expiredAt = initialEntries
      .filter(
        (entry) =>
          !entry.isCorrupted &&
          Boolean(entry.expiresAt && now >= entry.expiresAt),
      )
      .reduce((latest, entry) => Math.max(latest, entry.expiresAt ?? 0), 0);
    if (!expiredAt) return;

    if (expiredAt > lastRefreshAt.current) {
      lastRefreshAt.current = expiredAt;
      startTransition(() => router.refresh());
    }
  }, [initialEntries, now, router]);

  const copyCode = async (entry: VaultEntryView) => {
    if (!entry.currentCode) return;
    try {
      await copySecret(entry.currentCode);
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId(null), 1_500);
    } catch {
      setCopiedId(null);
    }
  };

  // The renamed card moves to its new place in the list, so say what happened above it.
  const showRenamed = useCallback((message: string) => {
    setListNotice(message);
    window.setTimeout(() => setListNotice(""), 4_000);
  }, []);

  return (
    <main className="vault-app flex flex-col gap-6" id="main-content">
      <VaultChrome />
      <header className="vault-head">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="section-kicker">Khu vực riêng tư</p>
          <h1 className="font-display text-4xl font-normal tracking-tight sm:text-5xl">
            Private Vault
          </h1>
          <div className="flex flex-wrap gap-2">
            <span className="vault-chip vault-chip-ok">
              <ShieldCheck aria-hidden="true" />
              Mã hóa trước khi lưu
            </span>
            <span className="vault-chip">
              <Clock3 aria-hidden="true" />
              Tự khóa sau {idleMinutes} phút không thao tác
            </span>
            <button
              className={`vault-chip ${unlockTotpEnabled ? "vault-chip-ok" : "vault-chip-warn"}`}
              onClick={() => setTab("security")}
              type="button"
            >
              <Smartphone aria-hidden="true" />
              {unlockTotpEnabled
                ? "Mã xác minh: đang bật"
                : "Mã xác minh: đang tắt"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BackupButton />
          <form action={lockEverywhereAction} onSubmit={clearSecretNow}>
            <Button className="min-h-11" type="submit" variant="outline">
              <LockKeyhole data-icon="inline-start" />
              {activeSessions && activeSessions > 1
                ? `Khóa ở mọi nơi (${activeSessions} phiên)`
                : "Khóa ở mọi nơi"}
            </Button>
          </form>
          <form action={lockVaultAction} onSubmit={clearSecretNow}>
            <Button className="min-h-11" type="submit">
              <Lock data-icon="inline-start" />
              Khóa vault
            </Button>
          </form>
        </div>
      </header>

      <Tabs onValueChange={(value) => setTab(value as VaultTab)} value={tab}>
        <TabsList
          aria-label="Khu vực trong vault"
          className="vault-tabs-list h-auto"
        >
          <TabsTrigger value="accounts">
            <KeyRound aria-hidden="true" className="size-4" />
            Tài khoản
            <span className="vault-count vault-count-muted">
              {entries.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="inbox">
            <Inbox aria-hidden="true" className="size-4" />
            Hộp thư
            {newMessages > 0 ? (
              <span className="vault-count">
                {newMessages}
                <span className="sr-only"> tin mới</span>
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Bảo mật
            {unlockTotpEnabled ? null : (
              <span className="vault-dot">
                <span className="sr-only">, cần bật mã xác minh</span>
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent className={tabPanel} forceMount value="accounts">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <section
              aria-labelledby="vault-list-title"
              className="flex min-w-0 flex-col gap-4"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    className="font-display text-2xl font-medium"
                    id="vault-list-title"
                  >
                    Tài khoản của bạn
                  </h2>
                  <p
                    aria-live="polite"
                    className="text-muted-foreground mt-1 text-sm"
                  >
                    {copiedId
                      ? `Đã sao chép mã, tự xóa sau ${SECRET_CLIPBOARD_SECONDS} giây`
                      : listNotice ||
                        "Bấm vào mã để sao chép. Mật khẩu luôn được che mặc định."}
                  </p>
                </div>
                {entries.length > 0 ? (
                  <label className="relative w-full sm:w-72">
                    <span className="sr-only">Tìm tài khoản</span>
                    <Search
                      aria-hidden="true"
                      className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                    />
                    <Input
                      className="min-h-11 pl-9"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Tìm theo dịch vụ hoặc tài khoản"
                      type="search"
                      value={query}
                    />
                  </label>
                ) : null}
              </div>

              {entries.length === 0 ? (
                <Empty className="vault-card min-h-72">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <KeyRound aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Vault đang trống</EmptyTitle>
                    <EmptyDescription>
                      Thêm tài khoản đầu tiên cùng mật khẩu, ghi chú và 2FA nếu
                      có.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : visibleEntries.length === 0 ? (
                <p className="vault-card text-muted-foreground text-sm">
                  Không có tài khoản nào khớp “{query.trim()}”.
                </p>
              ) : (
                // Columns at least 20rem wide, so a code never wraps and a long account name
                // never pushes the card past a phone screen.
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-4">
                  {visibleEntries.map((entry) => (
                    <CredentialCard
                      entry={entry}
                      key={entry.id}
                      now={now}
                      onCopy={copyCode}
                      onRenamed={showRenamed}
                      wasCopied={copiedId === entry.id}
                    />
                  ))}
                </div>
              )}
            </section>

            <aside aria-label="Thêm tài khoản mới">
              <ImportPanel existing={initialEntries} />
            </aside>
          </div>
        </TabsContent>

        <TabsContent className={tabPanel} forceMount value="inbox">
          <MessagesPanel
            loadFailed={messagesFailed}
            messages={initialMessages}
          />
        </TabsContent>

        <TabsContent className={tabPanel} forceMount value="security">
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
            <SecurityPanel
              enabled={unlockTotpEnabled}
              shortPassword={shortPassword}
            />
            <SessionsCard
              activeSessions={activeSessions}
              idleMinutes={idleMinutes}
            />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
