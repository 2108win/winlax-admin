"use client";

import { useEffect, type ReactNode } from "react";

let mounted = 0;

/**
 * Marks <html> while a vault screen is on screen, so the public footer and the "more to
 * explore" block step aside (see vault.css). The mark is removed on unmount, which also runs
 * when Next keeps the vault route mounted but hidden after navigating away, so public pages
 * always get their footer back. A counter keeps it correct if two vault screens overlap.
 */
export function VaultChrome() {
  useEffect(() => {
    mounted += 1;
    document.documentElement.dataset.vault = "";
    return () => {
      mounted -= 1;
      if (mounted === 0) delete document.documentElement.dataset.vault;
    };
  }, []);
  return null;
}

/** The dark, full-height stage used for every screen shown before the vault is open. */
export function VaultStage({ children }: { children: ReactNode }) {
  return (
    <main className="vault-stage" id="main-content">
      <VaultChrome />
      <div aria-hidden="true" className="vault-stage-glow" />
      <div className="vault-stage-inner">{children}</div>
    </main>
  );
}
