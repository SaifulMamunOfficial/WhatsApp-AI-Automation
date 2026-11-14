"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { addHoliday, deleteHoliday, setHolidayEnabled, updateHoliday } from "./holidays";

// Admin-only; every action re-checks the role.

export interface HolidayFormState {
  error?: string;
  okAt?: number;
}

const id = z.uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const fields = (f: FormData) => ({ name: str(f, "name"), startDate: str(f, "startDate"), endDate: str(f, "endDate"), text: str(f, "text") });
const done = () => revalidatePath("/settings/holidays");

export async function addHolidayAction(_prev: HolidayFormState, formData: FormData): Promise<HolidayFormState> {
  await requireRole("admin");
  const r = await addHoliday(db, fields(formData));
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function updateHolidayAction(_prev: HolidayFormState, formData: FormData): Promise<HolidayFormState> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (!i.success) return { error: "ভুল অনুরোধ।" };
  const r = await updateHoliday(db, i.data, fields(formData));
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function toggleHolidayAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await setHolidayEnabled(db, i.data, formData.get("enabled") === "true");
  done();
}

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await deleteHoliday(db, i.data);
  done();
}
