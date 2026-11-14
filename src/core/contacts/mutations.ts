import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { publishInboxEvent } from "@/core/inbox/events";
import type { Db } from "@/core/inbox/ingest";

export type Result = { ok: true } | { ok: false; error: string };

const MAX_NAME = 200;
const MAX_NOTES = 5000;
const MAX_TAG = 40;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export async function updateContact(db: Db, id: string, input: { name: string; notes: string }): Promise<Result> {
  const name = input.name.trim();
  const notes = input.notes.trim();
  if (name.length > MAX_NAME) return { ok: false, error: `নাম সর্বোচ্চ ${MAX_NAME} অক্ষর।` };
  if (notes.length > MAX_NOTES) return { ok: false, error: `নোট সর্বোচ্চ ${MAX_NOTES} অক্ষর।` };
  const c = schema.contacts;
  const done = await db
    .update(c)
    .set({ name: name || null, notes: notes || null, updatedAt: new Date() })
    .where(eq(c.id, id))
    .returning({ id: c.id });
  return done.length ? { ok: true } : { ok: false, error: "কন্টাক্ট পাওয়া যায়নি।" };
}

// ---- tags -----------------------------------------------------------------------------

async function findTagByName(db: Pick<Db, "select">, name: string) {
  const t = schema.tags;
  const [row] = await db.select({ id: t.id, name: t.name }).from(t).where(sql`lower(${t.name}) = lower(${name})`).limit(1);
  return row;
}

/** Tag names are unique ignoring case ("VIP" and "vip" are the same tag). */
export async function createTag(db: Db, nameInput: string, color?: string): Promise<Result & { id?: string }> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_TAG) return { ok: false, error: `ট্যাগের নাম ১–${MAX_TAG} অক্ষর হতে হবে।` };
  if (color && !COLOR.test(color)) return { ok: false, error: "রং #rrggbb ফরম্যাটে দিন।" };
  if (await findTagByName(db, name)) return { ok: false, error: "এই নামে ট্যাগ আগেই আছে।" };
  const [row] = await db.insert(schema.tags).values({ name, color: color || null }).returning({ id: schema.tags.id });
  return { ok: true, id: row.id };
}

export async function renameTag(db: Db, id: string, nameInput: string): Promise<Result> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_TAG) return { ok: false, error: `ট্যাগের নাম ১–${MAX_TAG} অক্ষর হতে হবে।` };
  const clash = await findTagByName(db, name);
  if (clash && clash.id !== id) return { ok: false, error: "এই নামে ট্যাগ আগেই আছে।" };
  const done = await db.update(schema.tags).set({ name }).where(eq(schema.tags.id, id)).returning({ id: schema.tags.id });
  return done.length ? { ok: true } : { ok: false, error: "ট্যাগ পাওয়া যায়নি।" };
}

/** Deleting a tag removes it from every contact (cascade), but never deletes a contact. */
export async function deleteTag(db: Db, id: string): Promise<Result> {
  const done = await db.delete(schema.tags).where(eq(schema.tags.id, id)).returning({ id: schema.tags.id });
  return done.length ? { ok: true } : { ok: false, error: "ট্যাগ পাওয়া যায়নি।" };
}

/** Puts a tag on a contact by name: reuses the tag if it exists (ignoring case), otherwise creates it first. */
export async function tagContactByName(db: Db, contactId: string, nameInput: string): Promise<Result> {
  const name = nameInput.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_TAG) return { ok: false, error: `ট্যাগের নাম ১–${MAX_TAG} অক্ষর হতে হবে।` };
  const existing = await findTagByName(db, name);
  let tagId = existing?.id;
  if (!tagId) {
    const created = await createTag(db, name);
    if (!created.ok || !created.id) return { ok: false, error: created.ok ? "ট্যাগ বানানো যায়নি।" : created.error };
    tagId = created.id;
  }
  return addTagToContact(db, contactId, tagId);
}

export async function addTagToContact(db: Db, contactId: string, tagId: string): Promise<Result> {
  const [c] = await db.select({ id: schema.contacts.id }).from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1);
  const [t] = await db.select({ id: schema.tags.id }).from(schema.tags).where(eq(schema.tags.id, tagId)).limit(1);
  if (!c || !t) return { ok: false, error: "কন্টাক্ট বা ট্যাগ পাওয়া যায়নি।" };
  await db.insert(schema.contactTags).values({ contactId, tagId }).onConflictDoNothing();
  return { ok: true };
}

export async function removeTagFromContact(db: Db, contactId: string, tagId: string): Promise<Result> {
  await db.delete(schema.contactTags).where(and(eq(schema.contactTags.contactId, contactId), eq(schema.contactTags.tagId, tagId)));
  return { ok: true };
}

// ---- merge ----------------------------------------------------------------------------

/**
 * Merges `mergeId` INTO `keepId`: one person who reached out on several channels (a WhatsApp
 * number and a Facebook account) becomes one contact. Identities, conversations and tags move
 * to the kept contact; notes are combined; the kept contact's name wins (the other's fills a
 * gap). The merged contact record is then deleted. Message history is never touched. This
 * cannot be undone, so the UI asks for confirmation and only admins may do it.
 */
export async function mergeContacts(db: Db, keepId: string, mergeId: string): Promise<Result> {
  if (keepId === mergeId) return { ok: false, error: "একই কন্টাক্ট নিজের সাথে মেলানো যায় না।" };

  const conversationIds = await db.transaction(async (tx) => {
    const c = schema.contacts;
    const [keep] = await tx.select().from(c).where(eq(c.id, keepId)).limit(1);
    const [gone] = await tx.select().from(c).where(eq(c.id, mergeId)).limit(1);
    if (!keep || !gone) return null;

    await tx.update(schema.contactIdentities).set({ contactId: keepId }).where(eq(schema.contactIdentities.contactId, mergeId));
    const moved = await tx
      .update(schema.conversations)
      .set({ contactId: keepId })
      .where(eq(schema.conversations.contactId, mergeId))
      .returning({ id: schema.conversations.id });

    // Union of tags (the same tag on both is fine).
    const goneTags = await tx.select({ tagId: schema.contactTags.tagId }).from(schema.contactTags).where(eq(schema.contactTags.contactId, mergeId));
    if (goneTags.length) {
      await tx.insert(schema.contactTags).values(goneTags.map((t) => ({ contactId: keepId, tagId: t.tagId }))).onConflictDoNothing();
    }

    const notes = [keep.notes, gone.notes].filter((n): n is string => !!n).join("\n---\n");
    await tx
      .update(c)
      .set({ name: keep.name ?? gone.name, notes: notes || null, updatedAt: new Date() })
      .where(eq(c.id, keepId));

    await tx.delete(c).where(eq(c.id, mergeId)); // remaining rows (tags) cascade
    return moved.map((m) => m.id);
  });

  if (conversationIds === null) return { ok: false, error: "কন্টাক্ট পাওয়া যায়নি।" };
  for (const conversationId of conversationIds) publishInboxEvent({ type: "conversation", conversationId });
  return { ok: true };
}
