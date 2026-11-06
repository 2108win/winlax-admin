import { AccountPassword } from "@/components/account-password";
import { TrustedDevices } from "@/components/trusted-devices";
import { listTrustedDevices } from "@/lib/auth";
import { query } from "@/lib/db";
import { env } from "@/lib/env";
import { dateTime } from "@/lib/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const rows = await query<{ updated_at: Date }>(
    "select updated_at from admin_settings where key = 'password_hash'",
  );
  const devices = (await listTrustedDevices(env.adminEmail)).map((device) => ({
    current: device.current,
    expiresAt: dateTime(device.expiresAt),
    id: device.id,
    ip: device.ip,
    label: device.label,
    lastUsedAt: dateTime(device.lastUsedAt),
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tài khoản</h1>
      <p className="text-sm text-base-content/50">
        Chỉ email {env.adminEmail} được vào trang quản trị, bằng Google hoặc email và mật khẩu. Máy lạ phải
        nhập thêm mã 2FA; máy đã ghi nhớ thì không.
      </p>
      <AccountPassword
        email={env.adminEmail}
        setAt={rows[0] ? dateTime(rows[0].updated_at) : null}
        minLength={MIN_PASSWORD_LENGTH}
      />
      <TrustedDevices devices={devices} />
    </div>
  );
}
