"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./ui";

// Two themes, chosen by the user: "light" (default) and "dark". The choice lives in the
// data-theme attribute on <html> (set before first paint by a tiny script in the root layout,
// so there is no flash) and is remembered in localStorage.

type Mode = "light" | "dark";
const KEY = "theme";

function read(): Mode {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  // Re-render whenever data-theme changes (our own switch, another tab's switch via storage).
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      document.documentElement.setAttribute("data-theme", e.newValue === "dark" ? "dark" : "light");
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

/** Current theme. The server (and first client render) assume "light", then it corrects itself. */
export function useTheme(): Mode {
  return useSyncExternalStore(subscribe, read, () => "light");
}

export function setTheme(mode: Mode) {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode / blocked storage: the choice just lasts until reload */
  }
}

/** Segmented control: আলো | অন্ধকার. */
export function ThemeSwitch({ className }: { className?: string }) {
  const mode = useTheme();
  const { t } = useI18n();
  const option = (value: Mode, label: string, Icon: typeof Sun) => (
    <button
      type="button"
      onClick={() => setTheme(value)}
      aria-pressed={mode === value}
      className={cn(
        "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all duration-200",
        mode === value ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg",
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );
  return (
    <div role="group" aria-label={t("থিম")} className={cn("flex rounded-xl bg-surface-2 p-1", className)}>
      {option("light", t("আলো"), Sun)}
      {option("dark", t("অন্ধকার"), Moon)}
    </div>
  );
}

/** Compact one-tap toggle for tight spaces (mobile top bar, login corner). */
export function ThemeIconButton({ className }: { className?: string }) {
  const mode = useTheme();
  const { t } = useI18n();
  const next: Mode = mode === "dark" ? "light" : "dark";
  const Icon = mode === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === "dark" ? t("অন্ধকার থিমে যান") : t("আলো থিমে যান")}
      title={next === "dark" ? t("অন্ধকার থিম") : t("আলো থিম")}
      className={cn("inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg", className)}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}
