import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";

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

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-lg font-semibold">Quản trị VPS winlax</h1>
        <p className="mt-1 text-sm text-white/60">Đăng nhập Google, sau đó nhập mã 2FA.</p>
        {error && ERRORS[error] && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{ERRORS[error]}</p>
        )}
        <a
          href="/api/auth/google/start"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black hover:bg-white/90"
        >
          Đăng nhập bằng Google
        </a>
      </div>
    </main>
  );
}
