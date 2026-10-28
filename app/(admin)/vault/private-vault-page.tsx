import { VaultDashboard } from "./vault-dashboard";
import "./vault.css";
import { listContactMessages } from "@/lib/vault/contact/repository";
import { getVaultConfigurationErrors } from "@/lib/vault/two-factor/config";
import { listVaultEntries } from "@/lib/vault/two-factor/repository";

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Vault 2FA</h1>
      <div className="max-w-xl rounded-xl border border-error/30 bg-error/10 p-4 text-sm">
        <p className="font-medium text-error">{title}</p>
        <div className="mt-2 text-base-content/60">{children}</div>
      </div>
    </div>
  );
}

/** The admin layout already requires the Google + 2FA login, so the vault opens straight away. */
export async function PrivateVaultPage() {
  const configurationErrors = getVaultConfigurationErrors();
  if (configurationErrors.length > 0) {
    return (
      <Notice title="Vault chưa được cấu hình">
        Thêm các biến sau vào env của winlax-admin rồi restart:
        <ul className="mt-2 list-disc pl-5 font-mono text-xs">
          {configurationErrors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </Notice>
    );
  }

  const [entriesResult, messagesResult] = await Promise.allSettled([
    listVaultEntries(),
    listContactMessages(),
  ]);
  if (entriesResult.status === "rejected") {
    return (
      <Notice title="Chưa đọc được dữ liệu vault">
        Kiểm tra <code className="font-mono text-xs">VAULT_DATABASE_URL</code> và database{" "}
        <code className="font-mono text-xs">winlax_v2</code>, rồi tải lại trang.
      </Notice>
    );
  }

  return (
    <VaultDashboard
      initialEntries={entriesResult.value}
      initialMessages={messagesResult.status === "fulfilled" ? messagesResult.value : []}
      messagesFailed={messagesResult.status === "rejected"}
      // A server component renders once per request; the client starts its countdown from
      // this time so its first render matches the server HTML.
      // eslint-disable-next-line react-hooks/purity
      renderedAt={Date.now()}
    />
  );
}
