"use client";

import { ClipboardList, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Card, EmptyState, buttonClass, cn, fieldClass } from "@/components/ui";
import type { OrderKind, OrderPriority, OrderStatus, Role } from "@/core/orders/rules";
import { useI18n } from "@/lib/i18n/client";
import { taka } from "@/lib/money";
import { KIND_LABEL, STATUS_LABEL, STATUS_TONE } from "./labels";
import { OrderDetailModal, type OrderDetailView, type TeamChoice } from "./order-detail";
import { OrderFormModal, type ContactChoice } from "./order-form";

export interface OrdersParams {
  status: string;
  kind: string;
  assigned: string;
  q: string;
  from: string;
  to: string;
  o: string;
}

export interface OrderRowView {
  id: string;
  label: string;
  kind: OrderKind;
  status: OrderStatus;
  priority: OrderPriority;
  title: string;
  customer: string;
  assignee: string | null;
  total: number;
  hasTotal: boolean;
  updated: string;
}

/** Builds an /orders URL from the current params with overrides; drops defaults and empties. */
export function ordersHref(params: OrdersParams, override: Partial<OrdersParams> = {}): string {
  const merged = { ...params, ...override };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (!v) continue;
    if (k === "status" && v === "open") continue;
    if (k === "assigned" && v === "all") continue;
    sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/orders?${qs}` : "/orders";
}

const select = cn(fieldClass, "!min-h-9 !w-auto min-w-0 !rounded-lg !py-1 !text-[13px] font-medium");

export function OrdersView({
  params,
  rows,
  team,
  contacts,
  detail,
  viewer,
}: {
  params: OrdersParams;
  rows: OrderRowView[];
  team: TeamChoice[];
  contacts: ContactChoice[];
  detail: OrderDetailView | null;
  viewer: { id: string; role: Role };
}) {
  const { t, num } = useI18n();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrderDetailView | null>(null);
  const [q, setQ] = useState(params.q);
  const go = (o: Partial<OrdersParams>) => router.push(ordersHref(params, { o: "", ...o }));
  const filtered = params.status !== "open" || params.kind !== "" || params.assigned !== "all" || params.q !== "" || params.from !== "" || params.to !== "";

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <div className="relative min-w-52 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("অর্ডার খুঁজুন")} placeholder={t("নম্বর, শিরোনাম, গ্রাহক বা ফোন")} className={cn(fieldClass, "!min-h-9 !pl-9")} />
          </div>
          <select aria-label={t("অবস্থা")} value={params.status} onChange={(e) => go({ status: e.target.value })} className={select}>
            <option value="open">{t("চলমান (অপেক্ষায় + চলছে)")}</option>
            <option value="all">{t("সব অবস্থা")}</option>
            {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
            ))}
          </select>
          <select aria-label={t("ধরন")} value={params.kind} onChange={(e) => go({ kind: e.target.value })} className={select}>
            <option value="">{t("সব ধরন")}</option>
            {(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => (
              <option key={k} value={k}>{t(KIND_LABEL[k])}</option>
            ))}
          </select>
          <select aria-label={t("দায়িত্ব")} value={params.assigned} onChange={(e) => go({ assigned: e.target.value })} className={select}>
            <option value="all">{t("সবার")}</option>
            <option value="me">{t("আমার")}</option>
            <option value="none">{t("অনির্ধারিত")}</option>
            {team.filter((u) => u.id !== viewer.id).map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input type="date" aria-label={t("তৈরি: শুরুর তারিখ")} value={params.from} onChange={(e) => go({ from: e.target.value })} className={cn(select, "w-36")} />
          <input type="date" aria-label={t("তৈরি: শেষের তারিখ")} value={params.to} onChange={(e) => go({ to: e.target.value })} className={cn(select, "w-36")} />
          {filtered && (
            <Link href="/orders" onClick={() => setQ("")} className={buttonClass("secondary", "sm")}>{t("ফিল্টার মুছুন")}</Link>
          )}
          <button type="button" onClick={() => setCreating(true)} className={cn(buttonClass("primary", "md"), "ml-auto")}>
            <Plus aria-hidden className="size-4" />
            {t("নতুন অর্ডার")}
          </button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList aria-hidden className="size-8" />}
            title={filtered ? t("কোনো অর্ডার মেলেনি।") : t("এখনো কোনো অর্ডার নেই।")}
            hint={filtered ? t("ফিল্টার বদলে দেখুন।") : t("ইনবক্সে কথোপকথন থেকে বা ওপরের ‘নতুন অর্ডার’ দিয়ে প্রথমটা তৈরি করুন।")}
          />
        ) : (
          <>
          <ul className="divide-y divide-border md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={ordersHref(params, { o: r.id })} className="block space-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-brand">{r.label}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
                  </div>
                  <p className="break-words text-sm font-medium">{r.title}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{r.customer}</span>
                    <Badge>{t(KIND_LABEL[r.kind])}</Badge>
                    {r.priority === "high" && <Badge tone="danger">{t("জরুরি")}</Badge>}
                    {r.hasTotal && <span className="font-semibold text-fg">{taka(num(r.total))}</span>}
                    <span>{r.assignee ?? t("অনির্ধারিত")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full min-w-[44rem] text-sm">
              <thead className="border-b border-border bg-surface-2/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">{t("অর্ডার")}</th>
                  <th className="px-4 py-3">{t("গ্রাহক")}</th>
                  <th className="px-4 py-3">{t("অবস্থা")}</th>
                  <th className="px-4 py-3">{t("দায়িত্ব")}</th>
                  <th className="px-4 py-3 text-right">{t("মোট")}</th>
                  <th className="px-4 py-3">{t("হালনাগাদ")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => go({ o: r.id })} className="cursor-pointer transition-colors hover:bg-surface-2/60">
                    <td className="px-4 py-3">
                      <Link href={ordersHref(params, { o: r.id })} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand hover:underline">{r.label}</Link>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="max-w-64 truncate">{r.title}</span>
                        <Badge>{t(KIND_LABEL[r.kind])}</Badge>
                        {r.priority === "high" && <Badge tone="danger">{t("জরুরি")}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">{r.customer}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{t(STATUS_LABEL[r.status])}</Badge></td>
                    <td className="px-4 py-3 text-muted">{r.assignee ?? t("অনির্ধারিত")}</td>
                    <td className="px-4 py-3 text-right font-semibold">{r.hasTotal ? taka(num(r.total)) : "—"}</td>
                    <td className="px-4 py-3 text-muted">{r.updated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted">{t("দেখানো হচ্ছে {n}টি", { n: num(rows.length) })}</p>
      </Card>

      <OrderDetailModal
        order={detail}
        viewer={viewer}
        team={team}
        onClose={() => router.replace(ordersHref(params, { o: "" }))}
        onEdit={(o) => {
          setEditing(o);
          router.replace(ordersHref(params, { o: "" }));
        }}
      />
      <OrderFormModal open={creating} onClose={() => setCreating(false)} contacts={contacts} />
      <OrderFormModal open={editing !== null} onClose={() => setEditing(null)} order={editing ?? undefined} />
    </div>
  );
}
