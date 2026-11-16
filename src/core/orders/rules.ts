import { z } from "zod";

// Pure rules for orders: validation, totals, who may do what. No database access here.

export type OrderKind = "order" | "appointment" | "complaint";
export type OrderStatus = "pending" | "in_progress" | "resolved" | "cancelled";
export type OrderPriority = "normal" | "high";
export type Role = "admin" | "agent";

export const OPEN_STATUSES: OrderStatus[] = ["pending", "in_progress"];
export const isOpen = (s: OrderStatus) => s === "pending" || s === "in_progress";

export const MAX_ITEMS = 30;
const MAX_QTY = 10_000;
const MAX_PRICE = 10_000_000;
const MAX_TOTAL = 1_000_000_000;

// Bangladesh has no daylight saving, so the office clock is a fixed UTC+6.
const DHAKA_OFFSET_MS = 6 * 3600 * 1000;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** A `datetime-local` value (no zone) is the office's Dhaka time, whatever the server's zone is. */
export function parseOfficeDateTime(v: string): Date {
  return new Date(LOCAL_DATETIME.test(v) ? `${v}:00+06:00` : v);
}

/** The reverse, for filling a `datetime-local` input: yyyy-MM-ddTHH:mm in Dhaka time. */
export function toOfficeInput(d: Date | null): string {
  return d ? new Date(d.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16) : "";
}

/** ORD-0001 style label. */
export function formatOrderNumber(n: number): string {
  return `ORD-${String(n).padStart(4, "0")}`;
}

const text = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .transform((v) => (v === "" ? null : v))
    .nullable();

const itemSchema = z.object({
  name: z.string().trim().min(1, "পণ্যের নাম লিখুন।").max(120, "পণ্যের নাম খুব বড়।"),
  quantity: z.coerce.number().int("সংখ্যা পূর্ণসংখ্যা হতে হবে।").min(1, "সংখ্যা অন্তত ১ হতে হবে।").max(MAX_QTY, "সংখ্যা অনেক বেশি।"),
  unitPrice: z.coerce.number().int("দাম পূর্ণ টাকায় লিখুন।").min(0, "দাম ঋণাত্মক হতে পারে না।").max(MAX_PRICE, "দাম অনেক বেশি।"),
});

export const orderInputSchema = z.object({
  kind: z.enum(["order", "appointment", "complaint"]),
  priority: z.enum(["normal", "high"]),
  title: z.string().trim().min(1, "শিরোনাম লিখুন।").max(200, "শিরোনাম খুব বড়।"),
  note: text(2000, "নোট খুব বড়।"),
  deliveryName: text(120, "ডেলিভারির নাম খুব বড়।"),
  deliveryPhone: text(30, "ফোন নম্বর খুব বড়।"),
  deliveryAddress: text(500, "ঠিকানা খুব বড়।"),
  courier: text(80, "কুরিয়ারের নাম খুব বড়।"),
  trackingNumber: text(80, "ট্র্যাকিং নম্বর খুব বড়।"),
  appointmentAt: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : parseOfficeDateTime(v)))
    .refine((d) => d === null || !Number.isNaN(d.getTime()), "অ্যাপয়েন্টমেন্টের সময় ঠিক নয়।")
    .nullable(),
  items: z.array(itemSchema).max(MAX_ITEMS, "পণ্যের লাইন অনেক বেশি।"),
});

export type OrderInput = z.output<typeof orderInputSchema>;
export type OrderItemInput = OrderInput["items"][number];

export type Parsed = { ok: true; value: OrderInput; total: number } | { ok: false; error: string };

export function computeTotal(items: { quantity: number; unitPrice: number }[]): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
}

/** Validate raw (form) input. The total is always computed here, never taken from the client. */
export function parseOrderInput(raw: unknown): Parsed {
  const r = orderInputSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "ভুল তথ্য।" };
  const total = computeTotal(r.data.items);
  if (total > MAX_TOTAL) return { ok: false, error: "মোট টাকা অনেক বেশি।" };
  return { ok: true, value: r.data, total };
}

/**
 * Status changes. Open orders can go anywhere; a finished (resolved/cancelled) order can only be
 * reopened (back to pending), and only by an admin.
 */
export function canChangeStatus(from: OrderStatus, to: OrderStatus, role: Role): boolean {
  if (from === to) return false;
  if (isOpen(from)) return true;
  return role === "admin" && to === "pending";
}

/**
 * Who may assign: an admin anyone; an agent only themselves (taking an unassigned order or keeping
 * their own) and only release their own.
 */
export function canAssign(actor: { id: string; role: Role }, current: string | null, target: string | null): boolean {
  if (actor.role === "admin") return true;
  if (target === actor.id) return current === null || current === actor.id;
  if (target === null) return current === actor.id;
  return false;
}
