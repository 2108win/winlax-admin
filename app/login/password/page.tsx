import { redirect } from "next/navigation";

import { PasswordForm } from "@/components/password-form";
import { getPasswordHash, getPendingLogin } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";

export default async function PasswordPage() {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login?error=state");
  const create = (await getPasswordHash()) === null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-base-300 bg-base-200 p-8">
        <h1 className="text-lg font-semibold">{create ? "Đặt mật khẩu" : "Mật khẩu"}</h1>
        <p className="mt-1 text-sm text-base-content/60">{pending.email}</p>
        {create && (
          <p className="mt-4 text-sm text-base-content/70">
            Lần đầu: đặt mật khẩu cho trang quản trị. Từ lần sau, sau khi đăng nhập Google bạn nhập mật khẩu này.
          </p>
        )}
        <PasswordForm
          endpoint="/api/auth/password"
          redirectTo="/"
          minLength={create ? MIN_PASSWORD_LENGTH : undefined}
          email={pending.email}
        />
      </div>
    </main>
  );
}
