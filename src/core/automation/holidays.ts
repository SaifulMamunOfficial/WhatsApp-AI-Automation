import { asc, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";
import { daysBetween, isRealDate } from "./holiday-rules";

// Admin-side management of closed days. See holiday-rules.ts for the pure date logic.

export type HolidayResult = { ok: true } | { ok: false; error: string };

export const MAX_HOLIDAY_DAYS = 60;
export const MAX_HOLIDAYS = 200;

const h = schema.holidays;
const fail = (error: string) => ({ ok: false as const, error });

export interface HolidayRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  text: string;
  enabled: boolean;
}

/** Oldest first. */
export async function listHolidays(db: Db): Promise<HolidayRow[]> {
  return db.select({ id: h.id, name: h.name, startDate: h.startDate, endDate: h.endDate, text: h.text, enabled: h.enabled }).from(h).orderBy(asc(h.startDate));
}

function validate(input: { name: string; startDate: string; endDate: string; text: string }): { ok: true; value: { name: string; startDate: string; endDate: string; text: string } } | { ok: false; error: string } {
  const name = input.name.trim();
  const text = input.text.trim();
  if (!name || name.length > 100) return fail("নাম ১–১০০ অক্ষরের হতে হবে।");
  if (!text || text.length > 1000) return fail("টেক্সট ১ থেকে ১০০০ অক্ষরের মধ্যে হতে হবে।");
  if (!isRealDate(input.startDate) || !isRealDate(input.endDate)) return fail("তারিখ ঠিক নয়।");
  if (input.endDate < input.startDate) return fail("শেষের তারিখ শুরুর আগে হতে পারে না।");
  if (daysBetween(input.startDate, input.endDate) + 1 > MAX_HOLIDAY_DAYS) return fail("একটা ছুটি সর্বোচ্চ ৬০ দিনের হতে পারে।");
  return { ok: true, value: { name, startDate: input.startDate, endDate: input.endDate, text } };
}

export async function addHoliday(db: Db, input: { name: string; startDate: string; endDate: string; text: string }): Promise<HolidayResult> {
  const v = validate(input);
  if (!v.ok) return v;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(h);
  if (n >= MAX_HOLIDAYS) return fail("সর্বোচ্চ ২০০টি ছুটি রাখা যায়।");
  await db.insert(h).values(v.value);
  return { ok: true };
}

export async function updateHoliday(db: Db, id: string, input: { name: string; startDate: string; endDate: string; text: string }): Promise<HolidayResult> {
  const v = validate(input);
  if (!v.ok) return v;
  const done = await db.update(h).set(v.value).where(eq(h.id, id)).returning({ id: h.id });
  return done.length ? { ok: true } : fail("ছুটি পাওয়া যায়নি।");
}

export async function setHolidayEnabled(db: Db, id: string, enabled: boolean): Promise<HolidayResult> {
  const done = await db.update(h).set({ enabled }).where(eq(h.id, id)).returning({ id: h.id });
  return done.length ? { ok: true } : fail("ছুটি পাওয়া যায়নি।");
}

export async function deleteHoliday(db: Db, id: string): Promise<HolidayResult> {
  const done = await db.delete(h).where(eq(h.id, id)).returning({ id: h.id });
  return done.length ? { ok: true } : fail("ছুটি পাওয়া যায়নি।");
}
