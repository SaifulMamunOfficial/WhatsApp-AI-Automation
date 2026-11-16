"use client";

import { Bot, MoreHorizontal, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { buttonClass, cn } from "@/components/ui";
import { resumeBotAction } from "@/core/inbox/actions";
import { useI18n } from "@/lib/i18n/client";

const item = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-2";

/** The "more" menu: things you rarely need (open the contact, switch the bot back on, the customer's orders). */
export function HeaderMenu({
  conversationId,
  contactId,
  contactName,
  botPaused,
  orders,
}: {
  conversationId: string;
  contactId: string;
  contactName: string;
  botPaused: boolean;
  orders: { id: string; label: string; status: string; title: string }[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("আরও")}
        title={t("আরও")}
        className={buttonClass("secondary", "sm", "!size-9 !px-0")}
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          <Link role="menuitem" href={`/contacts/${contactId}`} className={item}>
            <UserRound aria-hidden className="size-4 text-muted" />
            {t("কন্টাক্ট দেখুন")}
          </Link>
          {botPaused && (
            <form action={resumeBotAction}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <button type="submit" role="menuitem" className={item}>
                <Bot aria-hidden className="size-4 text-muted" />
                {t("bot আবার চালু করুন")}
              </button>
            </form>
          )}
          {orders.length > 0 && (
            <div className="mt-1 border-t border-border pt-1.5">
              <p className="px-3 pb-1 text-xs font-semibold text-muted">{t("এই গ্রাহকের অর্ডার")}</p>
              {orders.slice(0, 5).map((o) => (
                <Link key={o.id} role="menuitem" href={`/orders?status=all&o=${o.id}`} className={cn(item, "justify-between")}>
                  <span className="font-semibold text-brand">{o.label}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{o.title}</span>
                </Link>
              ))}
              {orders.length > 5 && (
                <Link role="menuitem" href={`/orders?status=all&q=${encodeURIComponent(contactName)}`} className={cn(item, "text-brand")}>{t("সব দেখুন")}</Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
