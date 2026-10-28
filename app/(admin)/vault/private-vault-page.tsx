import { AlertTriangle, DatabaseZap, Settings2 } from "lucide-react";

import { UnlockForm } from "./unlock-form";
import { VaultStage } from "./vault-chrome";
import { VaultDashboard } from "./vault-dashboard";
import "./vault.css";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { listContactMessages } from "@/lib/vault/contact/repository";
import {
  getVaultConfigurationErrors,
  isShortVaultPassword,
} from "@/lib/vault/two-factor/config";
import { listVaultEntries } from "@/lib/vault/two-factor/repository";
import { getVaultSession } from "@/lib/vault/two-factor/session";
import {
  VAULT_IDLE_SECONDS,
  VaultStoreError,
  countActiveVaultSessions,
  readUnlockTotp,
} from "@/lib/vault/two-factor/vault-store";

function Notice({
  children,
  icon,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  wide?: boolean;
}) {
  return (
    <VaultStage>
      <section
        aria-labelledby="vault-notice-title"
        className={`vault-panel flex flex-col gap-4 p-6 sm:p-8${wide ? " vault-panel-wide" : ""}`}
      >
        <div className="vault-mark">{icon}</div>
        <p className="section-kicker">Private Vault</p>
        <h1
          className="font-display text-2xl font-normal tracking-tight"
          id="vault-notice-title"
        >
          {title}
        </h1>
        <div className="text-muted-foreground text-sm leading-6">
          {children}
        </div>
      </section>
    </VaultStage>
  );
}

function SetupNotice({ errors }: { errors: string[] }) {
  return (
    <Notice
      icon={<Settings2 aria-hidden="true" />}
      title="Vault chưa sẵn sàng"
      wide
    >
      <p>Cấu hình database và các biến môi trường trước khi mở trang này.</p>
      <Alert className="mt-4">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Cần bổ sung cấu hình</AlertTitle>
        <AlertDescription>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 font-mono text-xs">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
          <p className="mt-3 font-sans">
            Xem phần “Thiết lập Private Vault” trong README và chạy các migration
            trong db/migrations.
          </p>
        </AlertDescription>
      </Alert>
    </Notice>
  );
}

function DatabaseNotice() {
  return (
    <Notice
      icon={<DatabaseZap aria-hidden="true" />}
      title="Chưa kết nối được database"
    >
      Vault chưa đọc được bảng dữ liệu. Kiểm tra VAULT_DATABASE_URL và migration
      rồi tải lại trang.
    </Notice>
  );
}

/** Shown when the code is newer than the database: the owner has to run the new migration. */
function MigrationNotice() {
  return (
    <Notice
      icon={<DatabaseZap aria-hidden="true" />}
      title="Cần chạy migration mới"
      wide
    >
      Vault cần thêm bảng phiên đăng nhập và cài đặt. Chạy file{" "}
      <code className="font-mono text-xs break-all">
        db/migrations/20261018000000_vault_sessions_and_settings.sql
      </code>{" "}
      bằng <code className="font-mono text-xs">psql &quot;$VAULT_DATABASE_URL&quot; -f</code>. Dữ liệu
      hiện có không bị thay đổi.
    </Notice>
  );
}

function storeNotice(error: unknown) {
  return error instanceof VaultStoreError && error.missingTable ? (
    <MigrationNotice />
  ) : (
    <DatabaseNotice />
  );
}

export async function PrivateVaultPage() {
  const configurationErrors = getVaultConfigurationErrors();
  if (configurationErrors.length > 0) {
    return <SetupNotice errors={configurationErrors} />;
  }

  const session = await getVaultSession();
  if (session.status === "error") {
    return session.missingTable ? <MigrationNotice /> : <DatabaseNotice />;
  }

  if (session.status === "none") {
    let requireCode: boolean;
    try {
      requireCode = (await readUnlockTotp()).enabled;
    } catch (error) {
      return storeNotice(error);
    }
    return (
      <UnlockForm
        idleMinutes={VAULT_IDLE_SECONDS / 60}
        requireCode={requireCode}
      />
    );
  }

  const [entriesResult, messagesResult, unlockTotpResult, sessionsResult] =
    await Promise.allSettled([
      listVaultEntries(),
      listContactMessages(),
      readUnlockTotp(),
      countActiveVaultSessions(),
    ]);
  if (entriesResult.status === "rejected") return <DatabaseNotice />;
  if (unlockTotpResult.status === "rejected") {
    return storeNotice(unlockTotpResult.reason);
  }

  return (
    <VaultDashboard
      activeSessions={
        sessionsResult.status === "fulfilled" ? sessionsResult.value : null
      }
      idleSeconds={VAULT_IDLE_SECONDS}
      initialEntries={entriesResult.value}
      initialMessages={
        messagesResult.status === "fulfilled" ? messagesResult.value : []
      }
      messagesFailed={messagesResult.status === "rejected"}
      // A server component renders once per request; the client starts its countdown from
      // this time so its first render matches the server HTML.
      // eslint-disable-next-line react-hooks/purity
      renderedAt={Date.now()}
      shortPassword={isShortVaultPassword()}
      unlockTotpEnabled={unlockTotpResult.value.enabled}
    />
  );
}
