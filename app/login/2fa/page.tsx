import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { TotpForm } from "@/components/totp-form";
import { getPendingLogin, getTotpSecret, setEnrollSecret } from "@/lib/auth";
import { generateSecret, otpauthUri } from "@/lib/totp";

export default async function TwoFactorPage() {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login?error=state");

  let enroll: { qr: string; secret: string } | null = null;
  if (!(await getTotpSecret())) {
    const secret = pending.enrollSecret ?? generateSecret();
    if (!pending.enrollSecret) await setEnrollSecret(pending, secret);
    enroll = { qr: await QRCode.toDataURL(otpauthUri(secret, pending.email), { margin: 1, width: 220 }), secret };
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <h1 className="text-lg font-semibold">Mã 2FA</h1>
        <p className="mt-1 text-sm text-white/60">{pending.email}</p>
        {enroll && (
          <div className="mt-5 space-y-3 text-sm text-white/70">
            <p>
              Lần đầu: mở Google Authenticator (hoặc app tương tự), quét mã này rồi nhập 6 số app hiện ra.
              Mã chỉ hiện một lần.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR code */}
            <img src={enroll.qr} alt="Mã QR 2FA" className="mx-auto rounded-lg bg-white p-2" width={220} height={220} />
            <p className="break-all rounded bg-black/40 px-2 py-1 font-mono text-xs">{enroll.secret}</p>
          </div>
        )}
        <TotpForm endpoint="/api/auth/2fa" redirectTo="/" />
      </div>
    </main>
  );
}
