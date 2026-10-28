"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { TotpForm } from "@/components/totp-form";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const StepUpContext = createContext<Fetcher | null>(null);

/**
 * fetch() that, when an API answers 428 (fresh 2FA needed), asks for the code
 * and retries the request once.
 */
export function StepUpProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const waiting = useRef<((ok: boolean) => void) | null>(null);

  const askCode = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        waiting.current = resolve;
        setOpen(true);
      }),
    [],
  );

  const fetchWithStepUp = useCallback<Fetcher>(
    async (input, init) => {
      const response = await fetch(input, init);
      if (response.status !== 428) return response;
      if (!(await askCode())) return response;
      return fetch(input, init);
    },
    [askCode],
  );

  function finish(ok: boolean) {
    setOpen(false);
    waiting.current?.(ok);
    waiting.current = null;
  }

  return (
    <StepUpContext.Provider value={fetchWithStepUp}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11141b] p-6">
            <h2 className="font-semibold">Xác nhận lại bằng mã 2FA</h2>
            <p className="mt-1 text-sm text-white/60">Thao tác này cần mã mới (có hiệu lực 10 phút).</p>
            <TotpForm endpoint="/api/auth/stepup" onDone={() => finish(true)} />
            <button onClick={() => finish(false)} className="mt-3 w-full text-sm text-white/50 hover:text-white">
              Huỷ
            </button>
          </div>
        </div>
      )}
    </StepUpContext.Provider>
  );
}

export function useStepUpFetch(): Fetcher {
  const fetcher = useContext(StepUpContext);
  if (!fetcher) throw new Error("useStepUpFetch must be used inside StepUpProvider");
  return fetcher;
}
