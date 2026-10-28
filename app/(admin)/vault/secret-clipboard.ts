"use client";

/** How long a copied code or password stays in the clipboard. */
export const SECRET_CLIPBOARD_SECONDS = 30;

type Pending = { timer: number; token: number };

let pending: Pending | null = null;
let lastToken = 0;

function cancelPending(): void {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  window.removeEventListener("focus", clearOnFocus);
  pending = null;
}

function wipe(): void {
  // Browsers only allow clipboard writes from a focused page; a failed wipe is not an error.
  void navigator.clipboard?.writeText("").catch(() => {});
}

function clearOnFocus(): void {
  if (!pending) return;
  pending = null;
  wipe();
}

function clearIfStillLatest(token: number): void {
  if (pending?.token !== token) return;
  if (!document.hasFocus()) {
    // The clipboard can only be written while the page has focus: wipe on return.
    window.addEventListener("focus", clearOnFocus, { once: true });
    return;
  }
  pending = null;
  wipe();
}

/**
 * Copies a secret (a TOTP code or a password) and removes it from the clipboard after
 * SECRET_CLIPBOARD_SECONDS, unless something else was copied from the vault since.
 */
export async function copySecret(
  text: string,
  clearAfterMs = SECRET_CLIPBOARD_SECONDS * 1000,
): Promise<void> {
  await navigator.clipboard.writeText(text);
  cancelPending();
  lastToken += 1;
  const token = lastToken;
  pending = {
    timer: window.setTimeout(() => clearIfStillLatest(token), clearAfterMs),
    token,
  };
}

/** Copies something that is not secret. It replaces any pending secret, so there is nothing to wipe. */
export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  cancelPending();
}

/** Wipes a secret that is still waiting to be cleared, for example when the vault locks. */
export function clearSecretNow(): void {
  if (!pending) return;
  cancelPending();
  wipe();
}
