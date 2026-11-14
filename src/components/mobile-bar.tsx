"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LanguageIconButton } from "./language-switch";
import { ThemeIconButton } from "./theme-switch";

/** Top bar shown below the lg breakpoint, with a slide-over drawer for the main menu. */
export function MobileBar({ brand, nav, footer }: { brand: ReactNode; nav: ReactNode; footer: ReactNode }) {
  // The drawer is "open for this path": navigating changes the path, which closes it with no effect needed.
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (v: boolean) => setOpenPath(v ? pathname : null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { t } = useI18n();

  // Escape closes; focus moves into the drawer and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("মেনু খুলুন")}
          aria-expanded={open}
          className="inline-flex size-11 items-center justify-center rounded-xl text-fg transition-colors hover:bg-surface-2"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        {brand}
        <LanguageIconButton className="ml-auto" />
        <ThemeIconButton />
      </header>

      {open && (
        <div className="fixed inset-0 z-50">
          <div className="anim-fade-in absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <aside role="dialog" aria-modal="true" aria-label={t("মেনু")} className="anim-slide-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 bg-surface p-4 shadow-pop">
            <div className="flex items-center justify-between">
              {brand}
              <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={t("মেনু বন্ধ করুন")} className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-surface-2">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
            {footer}
          </aside>
        </div>
      )}
    </div>
  );
}
