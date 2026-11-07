"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole, requireUser } from "@/core/auth/dal";
import { db } from "@/db";
import { importContactsCsv, MAX_IMPORT_BYTES, type ImportResult } from "./import";
import { addTagToContact, createTag, deleteTag, mergeContacts, removeTagFromContact, renameTag, updateContact } from "./mutations";

// Every action re-checks the session; merge, import and tag deletion are admin-only because
// they change many records at once and cannot be undone.

const id = z.uuid();
const refresh = (contactId?: string) => {
  revalidatePath("/contacts");
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
  });
  if (!result.dryRun && !result.fatal) refresh();
  return { result };
}
