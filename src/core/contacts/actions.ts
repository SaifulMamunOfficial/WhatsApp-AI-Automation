"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/core/auth/dal";
import { db } from "@/db";
import { importContactsCsv, MAX_IMPORT_BYTES, type ImportResult } from "./import";
import { addTagToContact, createTag, deleteTag, mergeContacts, removeTagFromContact, renameTag, tagContactByName, updateContact } from "./mutations";
import {
  createLifecycleStage,
  deleteLifecycleStage,
  updateContactStage,
  updateLifecycleStage,
} from "./stages";
import { exportContactsCsv, type ContactExportFilter, type ExportResult } from "./export";

// Every action re-checks the session; merge, import and tag deletion are admin-only because
// they change many records at once and cannot be undone.

const id = z.uuid();
const refresh = (contactId?: string) => {
  revalidatePath("/contacts");
  revalidatePath("/inbox");
  if (contactId) revalidatePath(`/contacts/${contactId}`);
};

export async function saveContactAction(formData: FormData): Promise<void> {
  await requireUser();
  const i = id.safeParse(formData.get("id"));
  if (!i.success) return;
  await updateContact(db, i.data, { name: String(formData.get("name") ?? ""), notes: String(formData.get("notes") ?? "") });
  refresh(i.data);
}

export async function createTagAction(formData: FormData): Promise<void> {
  await requireUser();
  const color = String(formData.get("color") ?? "");
  await createTag(db, String(formData.get("name") ?? ""), color || undefined);
  refresh();
}

export async function renameTagAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await renameTag(db, i.data, String(formData.get("name") ?? ""));
  refresh();
}

export async function deleteTagAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await deleteTag(db, i.data);
  refresh();
}

export async function addTagAction(formData: FormData): Promise<void> {
  await requireUser();
  const c = id.safeParse(formData.get("contactId"));
  const t = id.safeParse(formData.get("tagId"));
  if (c.success && t.success) await addTagToContact(db, c.data, t.data);
  refresh(c.success ? c.data : undefined);
}

export interface TagByNameState {
  error?: string;
  okAt?: number;
}

/** Inbox: type a tag name, it is created if new and put on the contact. */
export async function tagByNameAction(_prev: TagByNameState, formData: FormData): Promise<TagByNameState> {
  await requireUser();
  const c = id.safeParse(formData.get("contactId"));
  if (!c.success) return { error: "ভুল অনুরোধ।" };
  const r = await tagContactByName(db, c.data, String(formData.get("name") ?? ""));
  refresh(c.data);
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function removeTagAction(formData: FormData): Promise<void> {
  await requireUser();
  const c = id.safeParse(formData.get("contactId"));
  const t = id.safeParse(formData.get("tagId"));
  if (c.success && t.success) await removeTagFromContact(db, c.data, t.data);
  refresh(c.success ? c.data : undefined);
}

/** Merges `mergeId` into `keepId`, then opens the kept contact. Needs the confirmation box ticked. */
export async function mergeContactsAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const keep = id.safeParse(formData.get("keepId"));
  const gone = id.safeParse(formData.get("mergeId"));
  if (!keep.success || !gone.success || formData.get("confirm") !== "on") return;
  const r = await mergeContacts(db, keep.data, gone.data);
  refresh();
  if (r.ok) redirect(`/contacts/${keep.data}`);
}

export interface ImportState {
  result?: ImportResult;
  error?: string;
}

/** CSV import. With "dry run" ticked nothing is saved; the same report is shown. */
export async function importContactsAction(_prev: ImportState | undefined, formData: FormData): Promise<ImportState> {
  await requireRole("admin");
  const channelId = id.safeParse(formData.get("channelId"));
  const file = formData.get("file");
  if (!channelId.success) return { error: "একটি WhatsApp চ্যানেল বেছে নিন।" };
  if (!(file instanceof File) || file.size === 0) return { error: "একটি CSV ফাইল বেছে নিন।" };
  if (file.size > MAX_IMPORT_BYTES) return { error: "ফাইল ২ MB-এর বেশি।" };

  const result = await importContactsCsv(db, {
    channelId: channelId.data,
    csv: await file.text(),
    extraTag: String(formData.get("extraTag") ?? "").trim() || undefined,
    dryRun: formData.get("dryRun") === "on",
    optIn: formData.get("optIn") === "on",
  });
  if (!result.dryRun && !result.fatal) refresh();
  return { result };
}

export async function updateContactStageAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const c = id.safeParse(formData.get("contactId"));
  const rawStage = formData.get("stageId");
  const s = rawStage && rawStage !== "none" && rawStage !== "" ? id.safeParse(rawStage) : null;
  if (!c.success) return { ok: false, error: "ভুল কন্টাক্ট আইডি।" };
  if (s && !s.success) return { ok: false, error: "ভুল স্টেজ আইডি।" };

  const res = await updateContactStage(db, c.data, s ? s.data : null, user.role);
  if (!res.ok) return { ok: false, error: res.error };
  refresh(c.data);
  return { ok: true };
}

const exportFilterSchema = z.object({
  search: z.string().max(200).optional(),
  stageId: z.string().uuid().optional(),
  optedIn: z.boolean().optional(),
  fromLastContactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toLastContactDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function exportContactsCsvAction(rawFilters: Partial<ContactExportFilter> = {}): Promise<ExportResult> {
  const user = await requireRole("admin");
  const parsed = exportFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    return { ok: false, code: "invalid_filter", error: "ভুল ফিল্টার।" };
  }
  return exportContactsCsv(db, parsed.data, user.role);
}

export async function createStageAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const name = String(formData.get("name") ?? "").trim();
  const colorKey = String(formData.get("colorKey") ?? "").trim();
  const res = await createLifecycleStage(db, { name, colorKey }, "admin");
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/settings/stages");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function updateStageAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  const stageId = id.safeParse(formData.get("stageId"));
  if (!stageId.success) return { ok: false, error: "ভুল স্টেজ আইডি।" };
  const name = formData.get("name") ? String(formData.get("name")).trim() : undefined;
  const colorKey = formData.get("colorKey") ? String(formData.get("colorKey")).trim() : undefined;
  
  const rawSort = formData.get("sortOrder");
  let sortOrder: number | undefined;
  if (rawSort !== null && rawSort !== "") {
    const num = Number(rawSort);
    if (!Number.isFinite(num) || num < 0 || num > 9999) {
      return { ok: false, error: "ভুল ক্রম মান।" };
    }
    sortOrder = Math.floor(num);
  }

  const res = await updateLifecycleStage(db, stageId.data, { name, colorKey, sortOrder }, "admin");
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/settings/stages");
  revalidatePath("/inbox");
  return { ok: true };
}

export async function deleteStageAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const stageId = id.safeParse(formData.get("stageId"));
  if (!stageId.success) return;
  await deleteLifecycleStage(db, stageId.data, "admin");
  revalidatePath("/settings/stages");
  revalidatePath("/inbox");
}
