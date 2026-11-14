"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { addQuickReply, deleteQuickReply, updateQuickReply } from "./quick-replies";

// Admin-only; every action re-checks the role.

export interface QuickReplyFormState {
  error?: string;
  okAt?: number;
}

const id = z.uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const done = () => {
  revalidatePath("/settings/quick-replies");
  revalidatePath("/inbox");
};

export async function addQuickReplyAction(_prev: QuickReplyFormState, formData: FormData): Promise<QuickReplyFormState> {
  await requireRole("admin");
  const r = await addQuickReply(db, { shortcut: str(formData, "shortcut"), body: str(formData, "body") });
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function updateQuickReplyAction(_prev: QuickReplyFormState, formData: FormData): Promise<QuickReplyFormState> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (!i.success) return { error: "ভুল অনুরোধ।" };
  const r = await updateQuickReply(db, i.data, { shortcut: str(formData, "shortcut"), body: str(formData, "body") });
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function deleteQuickReplyAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await deleteQuickReply(db, i.data);
  done();
}
