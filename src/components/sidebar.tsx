"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/client";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";
import { cn } from "./ui";

/**
 * The desktop side menu. It can shrink to a narrow rail (icons with a small label under each), the way
 * Talkly's does, to give the page more room. The choice is kept in a cookie for a year.
 * The menu items style themselves from `data-collapsed` on this element (see AppNav).
 */
export function Sidebar({ initialCollapsed, brand, brandMini, children }: { initialCollapsed: boolean; brand: ReactNode; brandMini: ReactNode; children: ReactNode }) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // The choice then just is not remembered.
    }
  }

  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? t("মেনু বড় করুন") : t("মেনু ছোট করুন");

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group/side relative hidden shrink-0 flex-col gap-4 border-r border-border transition-[width] duration-200 lg:flex",
        // The shrunk rail gets a slightly different tone so it reads as a separate strip.
        collapsed ? "w-[6rem] bg-surface-2 p-1.5" : "w-64 bg-surface p-4",
      )}
    >
      {/* The logo sits exactly above the icon column. In the rail the toggle is a small round tab on the
          edge, level with the logo, so it does not push the logo off-centre. */}
      <div className={cn("flex items-center", collapsed ? "justify-center pt-1" : "justify-between gap-2")}>
        {collapsed ? brandMini : brand}
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={collapsed}
          title={label}
          className={cn(
            "inline-flex shrink-0 items-center justify-center text-muted transition-colors hover:text-fg",
            collapsed
              ? "absolute -right-3.5 top-3.5 z-20 size-7 rounded-full border border-border bg-surface shadow-card before:absolute before:-inset-2 before:content-[''] hover:bg-surface-2"
              : "size-9 rounded-lg hover:bg-surface-2",
          )}
        >
          <Icon aria-hidden className={collapsed ? "size-4" : "size-5"} />
        </button>
      </div>
      {/* In the rail the scrollbar is hidden (the plain .scroll-thin class would override a utility, so it is left off); wheel and touch still scroll. */}
      <div className={cn("min-h-0 flex-1 overflow-y-auto", collapsed ? "no-scrollbar" : "scroll-thin")}>{children}</div>
    </aside>
  );
}
