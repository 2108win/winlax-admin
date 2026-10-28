import type { Metadata } from "next";

import { PrivateVaultPage } from "./private-vault-page";

export const metadata: Metadata = {
  description: "Kho thông tin đăng nhập cá nhân.",
  robots: { follow: false, index: false },
  title: "Vault 2FA | Quản trị VPS",
};

export default function TwoFactorPage() {
  return <PrivateVaultPage />;
}
