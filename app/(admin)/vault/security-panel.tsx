"use client";

import { ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useFormStatus } from "react-dom";

import {
  disableUnlockTotpAction,
  enableUnlockTotpAction,
  startUnlockTotpSetupAction,
} from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type {
  UnlockTotpSetupState,
  VaultActionState,
} from "@/lib/vault/two-factor/types";

const idle: VaultActionState = { message: "", status: "idle" };

function SubmitButton({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant?: "destructive" | "default";
}) {
  const { pending } = useFormStatus();
  return (
    <Button disabled={pending} type="submit" variant={variant}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {children}
    </Button>
  );
}

/** Password and code, the two things every change to the unlock code asks for. */
function ConfirmFields({
  idPrefix,
  state,
}: {
  idPrefix: string;
  state: VaultActionState;
}) {
  const codeError = state.fieldErrors?.code;
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-password`}>Mật khẩu vault</FieldLabel>
        <Input
          autoComplete="current-password"
          id={`${idPrefix}-password`}
          name="password"
          required
          type="password"
        />
      </Field>
      <Field data-invalid={Boolean(codeError)}>
        <FieldLabel htmlFor={`${idPrefix}-code`}>
          Mã 6 số trong ứng dụng
        </FieldLabel>
        <Input
          aria-invalid={Boolean(codeError)}
          autoComplete="one-time-code"
          className="font-mono tracking-[0.3em]"
          id={`${idPrefix}-code`}
          inputMode="numeric"
          maxLength={7}
          name="code"
          pattern="[0-9 ]{6,7}"
          required
        />
        <FieldError>{codeError}</FieldError>
      </Field>
      {state.status === "error" && !codeError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

/** Draws the setup QR code as inline SVG; the secret never goes into a URL or an image request. */
function SetupQrCode({ uri }: { uri: string }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = container.current;
    let cancelled = false;
    void import("@zxing/browser").then(({ BrowserQRCodeSvgWriter }) => {
      if (cancelled || !node) return;
      const svg = new BrowserQRCodeSvgWriter().write(uri, 192, 192);
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        "Mã QR để thêm Private Vault vào ứng dụng xác thực",
      );
      node.replaceChildren(svg);
    });
    return () => {
      cancelled = true;
      node?.replaceChildren();
    };
  }, [uri]);

  return (
    <div
      className="flex size-[13rem] items-center justify-center rounded-xl bg-white p-2"
      ref={container}
    />
  );
}

function EnableFlow() {
  const [setup, setSetup] = useState<UnlockTotpSetupState | null>(null);
  const [starting, startSetup] = useTransition();
  const [state, formAction] = useActionState(enableUnlockTotpAction, idle);

  if (state.status === "success") {
    return (
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }

  if (!setup?.setup) {
    return (
      <div className="flex flex-col gap-3">
        <Button
          className="w-fit"
          disabled={starting}
          onClick={() =>
            startSetup(async () => setSetup(await startUnlockTotpSetupAction()))
          }
          type="button"
        >
          {starting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Smartphone data-icon="inline-start" />
          )}
          Bật mã xác minh
        </Button>
        {setup?.status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{setup.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input name="secret" type="hidden" value={setup.setup.secret} />
      <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-sm leading-6">
        <li>
          Mở Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương
          tự.
        </li>
        <li>Quét mã QR, hoặc nhập khóa bên dưới.</li>
        <li>Nhập mật khẩu vault và mã 6 số đang hiện để xác nhận.</li>
      </ol>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <SetupQrCode uri={setup.setup.otpauthUri} />
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-muted-foreground text-xs">Khóa thiết lập</span>
          <code className="font-mono text-sm break-all">
            {setup.setup.secret.match(/.{1,4}/gu)?.join(" ")}
          </code>
        </div>
      </div>
      <FieldGroup>
        <ConfirmFields idPrefix="enable-totp" state={state} />
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>Xác nhận và bật</SubmitButton>
        <Button onClick={() => setSetup(null)} type="button" variant="ghost">
          Hủy
        </Button>
      </div>
    </form>
  );
}

function DisableFlow() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(disableUnlockTotpAction, idle);

  if (state.status === "success") {
    return (
      <Alert>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  if (!open) {
    return (
      <Button
        className="w-fit"
        onClick={() => setOpen(true)}
        type="button"
        variant="outline"
      >
        <ShieldOff data-icon="inline-start" />
        Tắt mã xác minh
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FieldGroup>
        <ConfirmFields idPrefix="disable-totp" state={state} />
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="destructive">Tắt mã xác minh</SubmitButton>
        <Button onClick={() => setOpen(false)} type="button" variant="ghost">
          Hủy
        </Button>
      </div>
    </form>
  );
}

export function SecurityPanel({
  enabled,
  shortPassword = false,
}: {
  enabled: boolean;
  shortPassword?: boolean;
}) {
  return (
    <section aria-labelledby="vault-security-title">
      <Card className="glass-content">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle asChild>
              <h2 className="font-display text-2xl" id="vault-security-title">
                Mã xác minh khi mở vault
              </h2>
            </CardTitle>
            <Badge variant={enabled ? "secondary" : "outline"}>
              {enabled ? "Đang bật" : "Đang tắt"}
            </Badge>
          </div>
          <CardDescription className="leading-6">
            {enabled
              ? "Mở vault cần cả mật khẩu và mã 6 số trong ứng dụng xác thực. Mất điện thoại thì xóa dòng unlock_totp trong bảng vault_settings của Supabase (xem README)."
              : "Thêm mã 6 số từ điện thoại, để lộ mật khẩu thôi chưa đủ để mở vault."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {shortPassword && !enabled ? (
            <Alert variant="destructive">
              <AlertDescription>
                Mật khẩu vault ngắn hơn 12 ký tự. Hãy bật mã xác minh để người
                đoán ra mật khẩu vẫn không mở được vault.
              </AlertDescription>
            </Alert>
          ) : null}
          {enabled ? <DisableFlow /> : <EnableFlow />}
        </CardContent>
      </Card>
    </section>
  );
}
