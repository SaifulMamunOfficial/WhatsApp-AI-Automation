"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarOff, ClipboardList, KeyRound, Layers, LayoutDashboard, Megaphone, MessageSquare, MessageSquareText, Plug, UserCog, Users, Zap, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "./ui";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "কাজ",
    items: [
      { href: "/dashboard", label: "ড্যাশবোর্ড", icon: LayoutDashboard },
      { href: "/inbox", label: "ইনবক্স", icon: MessageSquare },
      { href: "/analytics", label: "বিশ্লেষণ", icon: BarChart3, adminOnly: true },
      { href: "/contacts", label: "কন্টাক্ট", icon: Users },
      { href: "/orders", label: "অর্ডারসমূহ", icon: ClipboardList },
    ],
  },
  { title: "প্রচার", items: [{ href: "/broadcasts", label: "Broadcast", icon: Megaphone, adminOnly: true }] },
  {
    title: "সেটিংস",
    items: [
      { href: "/settings/automations", label: "অটোমেশন", icon: Zap, adminOnly: true },
      { href: "/settings/stages", label: "লাইফসাইকেল স্টেজ", icon: Layers, adminOnly: true },
      { href: "/settings/holidays", label: "ছুটির দিন", icon: CalendarOff, adminOnly: true },
      { href: "/settings/quick-replies", label: "দ্রুত উত্তর", icon: MessageSquareText, adminOnly: true },
      { href: "/settings/knowledge", label: "জ্ঞানভান্ডার ও AI", icon: BookOpen, adminOnly: true },
      { href: "/settings/channels", label: "চ্যানেল", icon: Plug, adminOnly: true },
      { href: "/settings/team", label: "টিম", icon: UserCog, adminOnly: true },
      { href: "/settings/configuration", label: "কনফিগারেশন", icon: KeyRound, adminOnly: true },
    ],
  },
];

export function AppNav({ role, inboxUnread = 0, ordersOpen = 0 }: { role: "admin" | "agent"; inboxUnread?: number; ordersOpen?: number }) {
  const pathname = usePathname();
  const { t, num } = useI18n();

  return (
    <nav aria-label={t("প্রধান মেনু")} className="space-y-5 group-data-[collapsed=true]/side:space-y-3">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.adminOnly || role === "admin");
        if (items.length === 0) return null;
        return (
          <div key={g.title} className="space-y-1 group-data-[collapsed=true]/side:space-y-1 group-data-[collapsed=true]/side:border-t group-data-[collapsed=true]/side:border-border group-data-[collapsed=true]/side:pt-3 group-data-[collapsed=true]/side:first:border-t-0 group-data-[collapsed=true]/side:first:pt-0">
            <p className="px-3 pb-1 text-xs font-bold tracking-wide text-muted/80 group-data-[collapsed=true]/side:hidden">{t(g.title)}</p>
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  title={t(label)}
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors duration-200",
                    "group-data-[collapsed=true]/side:min-h-[3.75rem] group-data-[collapsed=true]/side:flex-col group-data-[collapsed=true]/side:justify-center group-data-[collapsed=true]/side:gap-1 group-data-[collapsed=true]/side:px-0.5 group-data-[collapsed=true]/side:py-2 group-data-[collapsed=true]/side:text-[10px] group-data-[collapsed=true]/side:leading-tight",
                    active ? "bg-brand-soft text-brand before:absolute before:inset-y-2.5 before:left-0 before:w-1 before:rounded-full before:bg-brand" : "text-muted hover:bg-surface-2 hover:text-fg group-data-[collapsed=true]/side:hover:bg-border/60",
                  )}
                >
                  <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.3 : 2} />
                  <span className="min-w-0 flex-1 truncate group-data-[collapsed=true]/side:w-full group-data-[collapsed=true]/side:flex-none group-data-[collapsed=true]/side:whitespace-normal group-data-[collapsed=true]/side:line-clamp-2 group-data-[collapsed=true]/side:text-center">{t(label)}</span>
                  {href === "/inbox" && inboxUnread > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-brand-fg [background-image:var(--brand-grad)] group-data-[collapsed=true]/side:absolute group-data-[collapsed=true]/side:right-1.5 group-data-[collapsed=true]/side:top-1 group-data-[collapsed=true]/side:px-1.5 group-data-[collapsed=true]/side:py-0 group-data-[collapsed=true]/side:text-[10px]" aria-label={t("{n}টি অপঠিত কথোপকথন", { n: num(inboxUnread) })}>
                      {inboxUnread > 99 ? "99+" : inboxUnread}
                    </span>
                  )}
                  {href === "/orders" && ordersOpen > 0 && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted group-data-[collapsed=true]/side:absolute group-data-[collapsed=true]/side:right-1.5 group-data-[collapsed=true]/side:top-1 group-data-[collapsed=true]/side:px-1.5 group-data-[collapsed=true]/side:py-0 group-data-[collapsed=true]/side:text-[10px]" aria-label={t("{n}টি চলমান অর্ডার", { n: num(ordersOpen) })}>
                      {ordersOpen > 99 ? "99+" : ordersOpen}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
