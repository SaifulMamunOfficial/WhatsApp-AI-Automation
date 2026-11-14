"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, CalendarOff, KeyRound, LayoutDashboard, Megaphone, MessageSquare, MessageSquareText, Plug, UserCog, Users, Zap, type LucideIcon } from "lucide-react";
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
    ],
  },
  { title: "প্রচার", items: [{ href: "/broadcasts", label: "Broadcast", icon: Megaphone, adminOnly: true }] },
  {
    title: "সেটিংস",
    items: [
      { href: "/settings/automations", label: "অটোমেশন", icon: Zap, adminOnly: true },
      { href: "/settings/holidays", label: "ছুটির দিন", icon: CalendarOff, adminOnly: true },
      { href: "/settings/quick-replies", label: "দ্রুত উত্তর", icon: MessageSquareText, adminOnly: true },
      { href: "/settings/knowledge", label: "জ্ঞানভান্ডার ও AI", icon: BookOpen, adminOnly: true },
      { href: "/settings/channels", label: "চ্যানেল", icon: Plug, adminOnly: true },
      { href: "/settings/team", label: "টিম", icon: UserCog, adminOnly: true },
      { href: "/settings/configuration", label: "কনফিগারেশন", icon: KeyRound, adminOnly: true },
    ],
  },
];

export function AppNav({ role, inboxUnread = 0 }: { role: "admin" | "agent"; inboxUnread?: number }) {
  const pathname = usePathname();
  const { t, num } = useI18n();

  return (
    <nav aria-label={t("প্রধান মেনু")} className="space-y-5">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !i.adminOnly || role === "admin");
        if (items.length === 0) return null;
        return (
          <div key={g.title} className="space-y-1">
            <p className="px-3 pb-1 text-xs font-bold tracking-wide text-muted/80">{t(g.title)}</p>
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-semibold transition-colors duration-200",
                    active ? "bg-brand-soft text-brand before:absolute before:inset-y-2.5 before:left-0 before:w-1 before:rounded-full before:bg-brand" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <Icon aria-hidden className="size-5 shrink-0" strokeWidth={active ? 2.3 : 2} />
                  <span className="min-w-0 flex-1 truncate">{t(label)}</span>
                  {href === "/inbox" && inboxUnread > 0 && (
                    <span className="rounded-full px-2 py-0.5 text-xs font-bold text-brand-fg [background-image:var(--brand-grad)]" aria-label={t("{n}টি অপঠিত কথোপকথন", { n: num(inboxUnread) })}>
                      {inboxUnread > 99 ? "99+" : inboxUnread}
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
