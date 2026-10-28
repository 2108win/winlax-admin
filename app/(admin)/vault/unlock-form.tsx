"use client";

import {
  Clock3,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { unlockVaultAction } from "./actions";
import { VaultStage } from "./vault-chrome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { VaultActionState } from "@/lib/vault/two-factor/types";

const initialState: VaultActionState = { message: "", status: "idle" };

function UnlockButton() {
  const { pending } = useFormStatus();
  return (
    <Button className="min-h-11 w-full" disabled={pending} type="submit">
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <LockKeyhole data-icon="inline-start" />
      )}
      {pending ? "Đang xác thực…" : "Mở vault"}
    </Button>
  );
}

export function UnlockForm({
  idleMinutes,
  requireCode = false,
}: {
  idleMinutes: number;
  requireCode?: boolean;
}) {
  const [state, formAction] = useActionState(unlockVaultAction, initialState);
  const passwordError = state.fieldErrors?.password;
  const codeError = state.fieldErrors?.code;

  return (
    <VaultStage>
      <div className="flex w-full flex-col items-center">
        <section
          aria-labelledby="vault-unlock-title"
          className="vault-panel p-6 sm:p-8"
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="vault-mark">
              <ShieldCheck aria-hidden="true" />
            </div>
            <p className="section-kicker">Khu vực riêng tư</p>
            <h1
              className="font-display text-3xl font-normal tracking-tight"
              id="vault-unlock-title"
            >
              Private Vault
            </h1>
            <p className="text-muted-foreground max-w-xs text-sm leading-6">
              {requireCode
                ? "Nhập mật khẩu riêng và mã 6 số từ ứng dụng xác thực để mở vault."
                : "Nhập mật khẩu riêng để truy cập tài khoản, mật khẩu và mã xác thực."}
            </p>
          </div>

          <form action={formAction} className="mt-7 flex flex-col gap-6">
            <FieldGroup>
              <Field data-invalid={Boolean(passwordError)}>
                <FieldLabel htmlFor="vault-password">Mật khẩu vault</FieldLabel>
                <Input
                  aria-invalid={Boolean(passwordError)}
                  autoComplete="current-password"
                  autoFocus
                  id="vault-password"
                  name="password"
                  required
                  type="password"
                />
                <FieldError>{passwordError}</FieldError>
              </Field>
              {requireCode ? (
                <Field data-invalid={Boolean(codeError)}>
                  <FieldLabel htmlFor="vault-code">Mã xác minh</FieldLabel>
                  <Input
                    aria-describedby="vault-code-hint"
                    aria-invalid={Boolean(codeError)}
                    autoComplete="one-time-code"
                    className="text-center font-mono text-lg tracking-[0.4em]"
                    id="vault-code"
                    inputMode="numeric"
                    maxLength={7}
                    name="code"
                    pattern="[0-9 ]{6,7}"
                    required
                  />
                  <p
                    className="text-muted-foreground text-xs"
                    id="vault-code-hint"
                  >
                    Mã 6 số trong ứng dụng xác thực, đổi sau mỗi 30 giây.
                  </p>
                  <FieldError>{codeError}</FieldError>
                </Field>
              ) : null}
              {state.status === "error" && !passwordError && !codeError ? (
                <Alert variant="destructive">
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
            <UnlockButton />
          </form>
        </section>

        <ul aria-label="Bảo vệ của vault" className="vault-trust">
          <li>
            <KeyRound aria-hidden="true" />
            Mã hóa AES-256 trước khi lưu
          </li>
          <li>
            <Clock3 aria-hidden="true" />
            Tự khóa sau {idleMinutes} phút không thao tác và sau tối đa 8 giờ
          </li>
          <li>
            <Smartphone aria-hidden="true" />
            Mã xác minh: {requireCode ? "đang bật" : "đang tắt"}
          </li>
        </ul>
      </div>
    </VaultStage>
  );
}
