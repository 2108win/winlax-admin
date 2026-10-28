"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { keepVaultSessionAliveAction } from "./actions";
import { clearSecretNow } from "./secret-clipboard";

const HEARTBEAT_INTERVAL_MS = 60_000;
const CHECK_INTERVAL_MS = 15_000;
/** While past the deadline, ask the server again at most this often. */
const RELOCK_INTERVAL_MS = 60_000;
const ACTIVITY_EVENTS = [
  "keydown",
  "pointerdown",
  "pointermove",
  "touchstart",
  "wheel",
] as const;

/**
 * Keeps the session alive while the owner is actually using the vault, and shows the lock
 * screen once they stop.
 *
 * The server decides when a session is idle: activity is reported at most once a minute, and
 * at the deadline this only refreshes the page so the server can render the lock screen. It
 * never revokes the session itself, so an idle second tab cannot sign out the tab in use.
 */
export function useIdleLock(idleSeconds: number): void {
  const router = useRouter();

  useEffect(() => {
    const idleMs = idleSeconds * 1000;
    let lastActivity = Date.now();
    let lastHeartbeat = Date.now();
    let lastLockAttempt = 0;

    // Another tab may still be keeping the session alive, in which case the server renders the
    // dashboard again; keep asking (once a minute) until it renders the lock screen, which
    // unmounts this hook.
    const lockScreen = () => {
      const now = Date.now();
      if (now - lastLockAttempt < RELOCK_INTERVAL_MS) return;
      lastLockAttempt = now;
      clearSecretNow();
      startTransition(() => router.refresh());
    };

    const onActivity = () => {
      const now = Date.now();
      lastActivity = now;
      if (now - lastHeartbeat < HEARTBEAT_INTERVAL_MS) return;
      lastHeartbeat = now;
      keepVaultSessionAliveAction()
        .then(({ active }) => {
          if (!active) lockScreen();
        })
        .catch(() => {});
    };

    const checkDeadline = () => {
      if (Date.now() - lastActivity >= idleMs) lockScreen();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkDeadline();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(checkDeadline, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [idleSeconds, router]);
}
