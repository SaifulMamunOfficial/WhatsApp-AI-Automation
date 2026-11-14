"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/lib/i18n/actions";
import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n";
import { cn } from "./ui";

// The two UI languages. Each is shown in its own script, so it is never translated.
const OPTIONS: { value: Locale; label: string; short: string }[] = [
  { value: "en", label: "English", short: "EN" },
  { value: "bn", label: "বাংলা", short: "বাং" },
];

function useSwitch() {
  const router = useRouter();
  const { locale } = useI18n();
  const [pending, start] = useTransition();
  const choose = (next: Locale) => {
    if (next === locale) return;
    start(async () => {
      await setLocaleAction(next);
      document.documentElement.lang = next === "bn" ? "bn" : "en";
      router.refresh();
    });
  };
  return { locale, pending, choose };
}

/** Segmented control: English | বাংলা. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, pending, choose } = useSwitch();
  return (
    <div role="group" aria-label="Language / ভাষা" className={cn("flex rounded-xl bg-surface-2 p-1", pending && "opacity-70", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          lang={o.value}
          onClick={() => choose(o.value)}
          aria-pressed={locale === o.value}
          className={cn(
            "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-all duration-200",
            locale === o.value ? "bg-surface text-brand shadow-card" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Compact one-tap toggle for tight spaces (mobile top bar, login corner): shows the OTHER language. */
export function LanguageIconButton({ className }: { className?: string }) {
  const { locale, pending, choose } = useSwitch();
  const next = OPTIONS.find((o) => o.value !== locale)!;
  return (
    <button
      type="button"
      onClick={() => choose(next.value)}
      lang={next.value}
      aria-label={`${next.label}`}
      title={next.label}
      className={cn("inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-2.5 text-sm font-bold text-muted transition-colors hover:bg-surface-2 hover:text-fg", pending && "opacity-70", className)}
    >
      <Languages aria-hidden className="size-5" />
      {next.short}
    </button>
  );
}
