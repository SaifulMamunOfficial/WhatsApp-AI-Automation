import { Suspense } from "react";
import { connection } from "next/server";
import { desc, sql } from "drizzle-orm";
import { CheckCircle2, ClipboardList, Hourglass, Loader, Wallet } from "lucide-react";
import { requireUser } from "@/core/auth/dal";
import { listAssignableUsers } from "@/core/inbox/queries";
import { agentSummary, getOrder, listOrders, orderStats, type OrderFilters } from "@/core/orders/queries";
import { formatOrderNumber, isOpen, toOfficeInput, type OrderKind, type OrderStatus } from "@/core/orders/rules";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { formatFull } from "@/lib/format";
import { Avatar, Card, PageHeader, PageShell, StatCard } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { taka } from "@/lib/money";
import { STATUS_LABEL } from "./labels";
import type { OrderDetailView } from "./order-detail";
import type { ContactChoice } from "./order-form";
import { OrdersView, type OrderRowView, type OrdersParams } from "./orders-view";

export const metadata = { title: "Orders — Saimum CRM" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function OrdersPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const STATUSES = ["open", "all", "pending", "in_progress", "resolved", "cancelled"];
const KINDS = ["order", "appointment", "complaint"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function readParams(raw: Record<string, string | string[] | undefined>): OrdersParams {
  const one = (k: string) => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const status = one("status");
  const assigned = one("assigned");
  return {
    status: STATUSES.includes(status) ? status : "open",
    kind: KINDS.includes(one("kind")) ? one("kind") : "",
    assigned: assigned === "me" || assigned === "none" || UUID.test(assigned) ? assigned : "all",
    q: one("q").slice(0, 100),
    from: DATE.test(one("from")) ? one("from") : "",
    to: DATE.test(one("to")) ? one("to") : "",
    o: UUID.test(one("o")) ? one("o") : "",
  };
}

async function Content({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  await connection();
  const { t, num, intl } = await getT();
  const params = readParams(await searchParams);
  const tz = officeHoursFromEnv().tz;

  const filters: OrderFilters = {
    status: params.status as OrderFilters["status"],
    kind: (params.kind || undefined) as OrderKind | undefined,
    assigned: params.assigned === "all" ? undefined : params.assigned,
    q: params.q || undefined,
    from: params.from || undefined,
    to: params.to || undefined,
  };

  const [rows, stats, team, everyone, contactRows, detailRaw, summary] = await Promise.all([
    listOrders(db, filters, user.id, tz),
    orderStats(db, tz),
    listAssignableUsers(db),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users),
    db
      .select({
        id: schema.contacts.id,
        name: schema.contacts.name,
        identity: sql<string | null>`(select ci.external_id from contact_identities ci where ci.contact_id = contacts.id order by ci.created_at asc limit 1)`,
      })
      .from(schema.contacts)
      .orderBy(desc(schema.contacts.updatedAt))
      .limit(300),
    params.o ? getOrder(db, params.o) : Promise.resolve(null),
    user.role === "admin" ? agentSummary(db) : Promise.resolve([]),
  ]);

  const name = new Map(everyone.map((u) => [u.id, u.name]));
  const who = (id: string | null) => (id ? (name.get(id) ?? "—") : t("অনির্ধারিত"));
  const customer = (n: string | null, ident: string | null) => n || ident || t("নামহীন");

  const rowViews: OrderRowView[] = rows.map((r) => ({
    id: r.id,
    label: formatOrderNumber(r.number),
    kind: r.kind,
    status: r.status,
    priority: r.priority,
    title: r.title,
    customer: customer(r.contactName, r.contactIdentity),
    assignee: r.assigneeName,
    total: r.totalAmount,
    hasTotal: r.itemCount > 0,
    updated: formatFull(r.updatedAt, intl),
  }));

  const contacts: ContactChoice[] = contactRows.map((c) => ({ id: c.id, label: c.name ? `${c.name}${c.identity ? ` · ${c.identity}` : ""}` : (c.identity ?? t("নামহীন")) }));

  let detail: OrderDetailView | null = null;
  if (detailRaw) {
    const { order: o, items, events } = detailRaw;
    const eventText = (e: (typeof events)[number]) => {
      const by = e.userName ?? "—";
      if (e.type === "created") return t("{name} তৈরি করেছেন", { name: by });
      if (e.type === "status") return t("{name} অবস্থা বদলেছেন: {from} → {to}", { name: by, from: t(STATUS_LABEL[e.fromValue as OrderStatus] ?? "—"), to: t(STATUS_LABEL[e.toValue as OrderStatus] ?? "—") });
      if (e.type === "assigned") return t("{name} দায়িত্ব বদলেছেন: {from} → {to}", { name: by, from: who(e.fromValue), to: who(e.toValue) });
      return t("{name} সম্পাদনা করেছেন", { name: by });
    };
    detail = {
      id: o.id,
      label: formatOrderNumber(o.number),
      contactId: o.contactId,
      contactName: customer(o.contactName, o.contactIdentity),
      conversationId: o.conversationId,
      kind: o.kind,
      status: o.status,
      priority: o.priority,
      title: o.title,
      note: o.note ?? "",
      deliveryName: o.deliveryName ?? "",
      deliveryPhone: o.deliveryPhone ?? "",
      deliveryAddress: o.deliveryAddress ?? "",
      courier: o.courier ?? "",
      trackingNumber: o.trackingNumber ?? "",
      appointmentAt: toOfficeInput(o.appointmentAt),
      appointmentText: o.appointmentAt ? formatFull(o.appointmentAt, intl) : null,
      items: items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      finished: !isOpen(o.status),
      assignedUserId: o.assignedUserId,
      assigneeName: o.assigneeName,
      total: o.totalAmount,
      createdText: formatFull(o.createdAt, intl),
      events: events.map((e) => ({ id: e.id, at: formatFull(e.createdAt, intl), text: eventText(e) })),
    };
  }

  return (
    <PageShell>
      <PageHeader title={t("অর্ডারসমূহ")} description={t("গ্রাহকের অর্ডার, অ্যাপয়েন্টমেন্ট ও অভিযোগ এক জায়গায়: কে নিয়েছে, কী অবস্থা, কত টাকা।")} />

      <section aria-label={t("মূল সংখ্যা")} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={<ClipboardList className="size-5" />} label={t("মোট")} value={num(stats.total)} />
        <StatCard icon={<Hourglass className="size-5" />} label={t("অপেক্ষায়")} value={num(stats.pending)} tone={stats.pending > 0 ? "warning" : undefined} />
        <StatCard icon={<Loader className="size-5" />} label={t("চলছে")} value={num(stats.inProgress)} />
        <StatCard icon={<CheckCircle2 className="size-5" />} label={t("সমাধান")} value={num(stats.resolved)} tone="success" hint={t("বাতিল {n}", { n: num(stats.cancelled) })} />
        <StatCard icon={<Wallet className="size-5" />} label={t("এই মাসের অর্ডার (টাকা)")} value={taka(num(stats.monthAmount))} hint={t("বাতিল বাদে")} />
      </section>

      <OrdersView params={params} rows={rowViews} team={team.map((u) => ({ id: u.id, name: u.name }))} contacts={contacts} detail={detail} viewer={{ id: user.id, role: user.role }} />

      {user.role === "admin" && summary.length > 0 && (
        <Card className="space-y-3 p-4 sm:p-5">
          <div>
            <h2 className="text-base font-bold">{t("টিমের কাজ")}</h2>
            <p className="text-sm text-muted">{t("কার হাতে কয়টা অর্ডার চলছে আর কয়টা সমাধান হয়েছে (সব সময়ের)।")}</p>
          </div>
          <ul className="divide-y divide-border">
            {summary.map((s) => (
              <li key={s.userId} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Avatar name={s.name} size="sm" />
                <span className={s.active ? "min-w-0 flex-1 font-semibold" : "min-w-0 flex-1 font-semibold text-muted"}>
                  {s.name}
                  {!s.active && <span className="ml-2 text-xs font-normal">({t("নিষ্ক্রিয়")})</span>}
                </span>
                <span className="text-muted">{t("খোলা")}: <b className="text-fg">{num(s.open)}</b></span>
                <span className="text-muted">{t("সমাধান")}: <b className="text-fg">{num(s.resolved)}</b></span>
                <span className="text-muted">{t("সমাধান হওয়া অর্ডারের টাকা")}: <b className="text-fg">{taka(num(s.resolvedAmount))}</b></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
