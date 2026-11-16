import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { OPEN_STATUSES, type OrderKind, type OrderStatus } from "./rules";

const o = schema.orders;
const assignee = alias(schema.users, "assignee");

export interface OrderFilters {
  status?: OrderStatus | "open" | "all";
  kind?: OrderKind;
  /** "me" needs viewerId; "none" = unassigned; or a user id. */
  assigned?: "me" | "none" | string;
  q?: string;
  /** Created on/after this local date (YYYY-MM-DD) and before the end of `to`. */
  from?: string;
  to?: string;
  contactId?: string;
}

const LIMIT = 300;
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const columns = {
  id: o.id,
  number: o.number,
  kind: o.kind,
  status: o.status,
  priority: o.priority,
  title: o.title,
  note: o.note,
  totalAmount: o.totalAmount,
  deliveryName: o.deliveryName,
  deliveryPhone: o.deliveryPhone,
  deliveryAddress: o.deliveryAddress,
  courier: o.courier,
  trackingNumber: o.trackingNumber,
  appointmentAt: o.appointmentAt,
  conversationId: o.conversationId,
  contactId: o.contactId,
  assignedUserId: o.assignedUserId,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
  resolvedAt: o.resolvedAt,
  contactName: schema.contacts.name,
  // The contact's first known number/id, shown when the contact has no name.
  contactIdentity: sql<string | null>`(select ci.external_id from contact_identities ci where ci.contact_id = ${o.contactId} order by ci.created_at asc limit 1)`,
  assigneeName: assignee.name,
  itemCount: sql<number>`(select count(*)::int from order_items oi where oi.order_id = ${o.id})`,
};

function base(db: Db) {
  return db
    .select(columns)
    .from(o)
    .innerJoin(schema.contacts, eq(schema.contacts.id, o.contactId))
    .leftJoin(assignee, eq(assignee.id, o.assignedUserId));
}

export async function listOrders(db: Db, filters: OrderFilters, viewerId: string, tz = "Asia/Dhaka") {
  const where: SQL[] = [];
  const status = filters.status ?? "all";
  if (status === "open") where.push(inArray(o.status, OPEN_STATUSES));
  else if (status !== "all") where.push(eq(o.status, status));
  if (filters.kind) where.push(eq(o.kind, filters.kind));
  if (filters.contactId && uuidRe.test(filters.contactId)) where.push(eq(o.contactId, filters.contactId));
  if (filters.assigned === "me") where.push(eq(o.assignedUserId, viewerId));
  else if (filters.assigned === "none") where.push(sql`${o.assignedUserId} is null`);
  else if (filters.assigned && uuidRe.test(filters.assigned)) where.push(eq(o.assignedUserId, filters.assigned));

  if (filters.from && dateRe.test(filters.from)) where.push(gte(o.createdAt, sql`(${filters.from}::date)::timestamp at time zone ${tz}`));
  if (filters.to && dateRe.test(filters.to)) where.push(lt(o.createdAt, sql`((${filters.to}::date) + 1)::timestamp at time zone ${tz}`));

  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = q.replace(/^ord-?/i, "");
    const conds: (SQL | undefined)[] = [
      ilike(o.title, like),
      ilike(schema.contacts.name, like),
      ilike(o.deliveryPhone, like),
      ilike(o.trackingNumber, like),
      sql`exists (select 1 from contact_identities ci where ci.contact_id = ${o.contactId} and ci.external_id ilike ${like})`,
    ];
    if (/^\d{1,9}$/.test(digits)) conds.push(eq(o.number, Number(digits)));
    where.push(or(...conds)!);
  }

  return base(db)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(o.updatedAt))
    .limit(LIMIT);
}

export type OrderRow = Awaited<ReturnType<typeof listOrders>>[number];

export async function getOrder(db: Db, id: string) {
  const [order] = await base(db).where(eq(o.id, id)).limit(1);
  if (!order) return null;
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, id)).orderBy(asc(schema.orderItems.position));
  const events = await db
    .select({
      id: schema.orderEvents.id,
      type: schema.orderEvents.type,
      fromValue: schema.orderEvents.fromValue,
      toValue: schema.orderEvents.toValue,
      createdAt: schema.orderEvents.createdAt,
      userName: schema.users.name,
    })
    .from(schema.orderEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.orderEvents.userId))
    .where(eq(schema.orderEvents.orderId, id))
    .orderBy(asc(schema.orderEvents.createdAt));
  return { order, items, events };
}

/** Counts per status and money totals (cancelled orders never count as money). */
export async function orderStats(db: Db, tz = "Asia/Dhaka") {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${o.status} = 'pending')::int`,
      inProgress: sql<number>`count(*) filter (where ${o.status} = 'in_progress')::int`,
      resolved: sql<number>`count(*) filter (where ${o.status} = 'resolved')::int`,
      cancelled: sql<number>`count(*) filter (where ${o.status} = 'cancelled')::int`,
      monthAmount: sql<number>`coalesce(sum(${o.totalAmount}) filter (where ${o.status} <> 'cancelled' and ${o.kind} = 'order' and ${o.createdAt} >= (date_trunc('month', now() at time zone ${tz})) at time zone ${tz}), 0)::bigint`,
    })
    .from(o);
  return {
    total: Number(row?.total ?? 0),
    pending: Number(row?.pending ?? 0),
    inProgress: Number(row?.inProgress ?? 0),
    resolved: Number(row?.resolved ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    monthAmount: Number(row?.monthAmount ?? 0),
  };
}

/** Unfinished orders (pending + in progress), for the sidebar badge. */
export async function openOrderCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(o).where(inArray(o.status, OPEN_STATUSES));
  return Number(row?.n ?? 0);
}

/** Per team member: how many orders they hold and have finished (admin view). */
export async function agentSummary(db: Db) {
  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      active: schema.users.active,
      open: sql<number>`count(${o.id}) filter (where ${o.status} in ('pending','in_progress'))::int`,
      resolved: sql<number>`count(${o.id}) filter (where ${o.status} = 'resolved')::int`,
      resolvedAmount: sql<number>`coalesce(sum(${o.totalAmount}) filter (where ${o.status} = 'resolved' and ${o.kind} = 'order'), 0)::bigint`,
    })
    .from(schema.users)
    .leftJoin(o, eq(o.assignedUserId, schema.users.id))
    .groupBy(schema.users.id, schema.users.name, schema.users.active)
    .orderBy(asc(schema.users.name));
  return rows.map((r) => ({ ...r, open: Number(r.open), resolved: Number(r.resolved), resolvedAmount: Number(r.resolvedAmount) }));
}
