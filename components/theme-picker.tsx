"use client";

import { useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme";

export const THEMES = [
  { id: "dim", label: "Dim (tối dịu)" },
  { id: "night", label: "Night (xanh đêm)" },
  { id: "business", label: "Business (xám)" },
  { id: "dracula", label: "Dracula (tím)" },
  { id: "nord", label: "Nord (sáng)" },
  { id: "corporate", label: "Corporate (sáng)" },
  { id: "light", label: "Light (trắng)" },
] as const;


const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readTheme() {
  return document.documentElement.dataset.theme || "dim";
}

export function ThemePicker() {
  // The theme lives on <html data-theme>; the boot script in app/layout.tsx sets it before paint.
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dim");

  function choose(next: string) {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode: the theme just won't be remembered.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-base-content/50">Giao diện</span>
      <select
        aria-label="Chọn giao diện"
        className="select select-sm w-full"
        onChange={(event) => choose(event.target.value)}
        value={theme}
      >
        {THEMES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
