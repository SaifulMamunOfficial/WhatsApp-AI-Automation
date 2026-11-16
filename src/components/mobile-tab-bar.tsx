"use client";

import { ClipboardList, LayoutDashboard, MessageSquare, MoreHorizontal, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./ui";

/** The event the "More" tab sends; the drawer in MobileBar listens for it. */
export const OPEN_MENU_EVENT = "saimum:open-menu";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const TABS: Tab[] = [
  { href: "/inbox", label: "ইনবক্স", icon: MessageSquare },
  { href: "/orders", label: "অর্ডারসমূহ", icon: ClipboardList },
  { href: "/contacts", label: "কন্টাক্ট", icon: Users },
  { href: "/dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
];

/**
 * The phone's main navigation: four places you use all day, and "More" for the rest (the drawer).
 * Hidden inside an open conversation, where the reply box needs the whole bottom of the screen.
 */
export function MobileTabBar({ inboxUnread = 0, ordersOpen = 0 }: { inboxUnread?: number; ordersOpen?: number }) {
  const { t, num } = useI18n();
  const pathname = usePathname();
  const search = useSearchParams();
  if (pathname === "/inbox" && search.get("c")) return null;

  const badge = (href: string) => (href === "/inbox" ? inboxUnread : href === "/orders" ? ordersOpen : 0);

  return (
    <nav aria-label={t("প্রধান মেনু")} className="grid shrink-0 grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const n = badge(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors", active ? "text-brand" : "text-muted")}
          >
            <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full transition-colors", active && "bg-brand-soft")}>
              <Icon aria-hidden className="size-[22px]" strokeWidth={active ? 2.3 : 2} />
              {n > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-fg">{n > 99 ? "99+" : num(n)}</span>
              )}
            </span>
            <span className="max-w-full truncate px-1">{t(label)}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
        className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted transition-colors"
      >
        <span className="flex h-7 w-12 items-center justify-center rounded-full">
          <MoreHorizontal aria-hidden className="size-[22px]" />
        </span>
        <span>{t("আরও")}</span>
      </button>
    </nav>
  );
}
