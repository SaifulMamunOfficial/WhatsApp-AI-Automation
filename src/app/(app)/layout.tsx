import { and, eq, gt, sql } from "drizzle-orm";
import { Bell, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppNav } from "@/components/app-nav";
import { MobileBar } from "@/components/mobile-bar";
import { LanguageIconButton, LanguageSwitch } from "@/components/language-switch";
import { ThemeIconButton, ThemeSwitch } from "@/components/theme-switch";
import { Avatar, Badge, LogoMark } from "@/components/ui";
import { logout } from "@/core/auth/actions";
import { requireUserAllowingPasswordChange } from "@/core/auth/dal";
import { db } from "@/db";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { conversations } from "@/db/schema";

// Every page in this group requires a valid session. With Cache Components the session read
// must sit behind <Suspense>, so the guard wraps the whole shell.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Loading…</p>}>
      <AuthShell>{children}</AuthShell>
    </Suspense>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5 px-1">
      <LogoMark />
      <span className="text-[17px] font-bold tracking-tight">Saimum CRM</span>
    </span>
  );
}

async function AuthShell({ children }: { children: React.ReactNode }) {
  const user = await requireUserAllowingPasswordChange();
  const { locale, t } = await getT();

  // Open conversations with something unread: shown as a badge on the inbox link.
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(and(eq(conversations.status, "open"), gt(conversations.unreadCount, 0)));

  const userCard = (
    <div className="space-y-2 border-t border-border pt-3">
      <Link href="/settings/profile" title={t("আমার প্রোফাইল")} className="flex items-center gap-2.5 rounded-xl px-1 py-1 transition-colors hover:bg-surface-2">
        <Avatar name={user.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <Badge tone={user.role === "admin" ? "brand" : "neutral"}>{user.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")}</Badge>
        </div>
      </Link>
      <LanguageSwitch />
      <ThemeSwitch />
      <form action={logout}>
        <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted transition-colors hover:bg-danger-soft hover:text-danger">
          <LogOut aria-hidden className="size-[18px]" />
          {t("লগআউট")}
        </button>
      </form>
    </div>
  );

  return (
    <I18nProvider locale={locale}>
    <div className="flex h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 lg:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppNav role={user.role} inboxUnread={n} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-6 lg:flex">
          <form action="/inbox" role="search" className="relative w-full max-w-md">
            <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
            <input
              type="search"
              name="q"
              maxLength={100}
              aria-label={t("কথোপকথন খুঁজুন")}
              placeholder={t("নাম, নম্বর বা মেসেজ")}
              className="block min-h-11 w-full rounded-xl border border-border bg-bg pl-10 pr-3 text-[15px] transition-colors placeholder:text-muted/70 hover:border-border-strong focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/inbox" aria-label={t("{n}টি অপঠিত কথোপকথন", { n })} title={t("{n}টি অপঠিত কথোপকথন", { n })} className="relative inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-2 hover:text-fg">
              <Bell aria-hidden className="size-5" />
              {n > 0 && <span className="absolute right-1.5 top-1.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-brand-fg">{n > 99 ? "99+" : n}</span>}
            </Link>
            <LanguageIconButton />
            <ThemeIconButton />
            <span className="mx-2 h-8 w-px bg-border" aria-hidden />
            <Link href="/settings/profile" title={t("আমার প্রোফাইল")} className="flex items-center gap-2.5 rounded-xl px-2 py-1 transition-colors hover:bg-surface-2">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 leading-tight">
                <p className="max-w-40 truncate text-sm font-semibold">{user.name}</p>
                <p className="text-xs text-muted">{user.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")}</p>
              </div>
            </Link>
            <form action={logout}>
              <button type="submit" aria-label={t("লগআউট")} title={t("লগআউট")} className="ml-1 inline-flex size-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                <LogOut aria-hidden className="size-5" />
              </button>
            </form>
          </div>
        </header>
        <MobileBar brand={<Brand />} nav={<AppNav role={user.role} inboxUnread={n} />} footer={userCard} />
        <div className="scroll-thin page-glow min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
    </I18nProvider>
  );
}
