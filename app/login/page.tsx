import { redirect } from "next/navigation";

import { PasswordLoginForm } from "@/components/password-login-form";
import { getPasswordHash, getSession } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  state: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Thử lại.",
  google: "Google không xác nhận được đăng nhập. Thử lại.",
  email: "Tài khoản Google này không được phép vào trang quản trị.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSession()) redirect("/");
  const { error } = await searchParams;
  const passwordLogin = (await getPasswordHash()) !== null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-base-300 bg-base-200 p-8">
        <h1 className="text-lg font-semibold">Quản trị VPS winlax</h1>
        <p className="mt-1 text-sm text-base-content/60">
          {passwordLogin
            ? "Đăng nhập Google hoặc email và mật khẩu, sau đó nhập mã 2FA."
            : "Đăng nhập Google, sau đó nhập mã 2FA."}
        </p>
        {error && ERRORS[error] && (
          <p className="mt-4 rounded-lg bg-error/10 px-3 py-2 text-sm text-error">{ERRORS[error]}</p>
        )}
        <a
          href="/api/auth/google/start"
          className="mt-6 flex w-full items-center justify-center btn btn-primary"
        >
          Đăng nhập bằng Google
        </a>
        {passwordLogin && (
          <>
            <div className="divider text-xs text-base-content/50">hoặc</div>
            <PasswordLoginForm />
          </>
        )}
      </div>
    </main>
  );
}
