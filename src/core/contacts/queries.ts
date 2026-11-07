import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";

export const CONTACTS_PAGE_SIZE = 50;

export interface ContactFilters {
  q?: string;
  tagId?: string;
  channelType?: "whatsapp" | "messenger";
  page?: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface ContactListItem {
  id: string;
  name: string | null;
  createdAt: Date;
  identities: { id: string; externalId: string; channelType: "whatsapp" | "messenger"; channelName: string }[];
  tags: { id: string; name: string; color: string | null }[];
  lastMessageAt: Date | null;
}

/** Contacts with their identities, tags and last activity, newest activity first. */
export async function listContacts(db: Db, f: ContactFilters): Promise<{ items: ContactListItem[]; total: number; page: number }> {
  const c = schema.contacts;
  const ci = schema.contactIdentities;
  const where: (SQL | undefined)[] = [];

  const q = f.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(
      or(
        ilike(c.name, like),
        exists(db.select({ x: sql`1` }).from(ci).where(and(eq(ci.contactId, c.id), or(ilike(ci.externalId, like), ilike(ci.displayName, like))))),
      ),
    );
  }
  if (f.tagId) {
    where.push(exists(db.select({ x: sql`1` }).from(schema.contactTags).where(and(eq(schema.contactTags.contactId, c.id), eq(schema.contactTags.tagId, f.tagId)))));
  }
  if (f.channelType) {
    where.push(
      exists(
        db
          .select({ x: sql`1` })
          .from(ci)
          .innerJoin(schema.channels, eq(schema.channels.id, ci.channelId))
          .where(and(eq(ci.contactId, c.id), eq(schema.channels.type, f.channelType))),
      ),
    );
  }

  const cond = where.length ? and(...where) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(c).where(cond);
  const page = Math.max(1, Math.floor(f.page ?? 1));

  // Last activity = newest conversation message; contacts never messaged sort last.
  // Fully qualified on purpose: a single-table select makes drizzle emit bare column names, and inside the
  // subquery a bare "id" would bind to conversations.id instead of contacts.id (always null).
  const lastActivity = sql<Date | null>`(select max(cv."last_message_at") from "conversations" cv where cv."contact_id" = "contacts"."id")`;
  const rows = await db
    .select({ id: c.id, name: c.name, createdAt: c.createdAt, lastMessageAt: lastActivity })
    .from(c)
    .where(cond)
    .orderBy(sql`${lastActivity} desc nulls last`, desc(c.createdAt))
    .limit(CONTACTS_PAGE_SIZE)
    .offset((page - 1) * CONTACTS_PAGE_SIZE);

  const ids = rows.map((r) => r.id);
  const identities = ids.length
    ? await db
        .select({ id: ci.id, contactId: ci.contactId, externalId: ci.externalId, channelType: schema.channels.type, channelName: schema.channels.name })
        .from(ci)
        .innerJoin(schema.channels, eq(schema.channels.id, ci.channelId))
        .where(inArray(ci.contactId, ids))
    : [];
  const tagRows = ids.length
    ? await db
        .select({ contactId: schema.contactTags.contactId, id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
        .from(schema.contactTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
        .where(inArray(schema.contactTags.contactId, ids))
        .orderBy(asc(schema.tags.name))
    : [];

  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.createdAt,
    // The aggregate subquery can come back as a string from some drivers.
    lastMessageAt: r.lastMessageAt ? new Date(r.lastMessageAt) : null,
    identities: identities.filter((i) => i.contactId === r.id).map((i) => ({ id: i.id, externalId: i.externalId, channelType: i.channelType, channelName: i.channelName })),
    tags: tagRows.filter((t) => t.contactId === r.id).map((t) => ({ id: t.id, name: t.name, color: t.color })),
  }));
  return { items, total, page };
}

export async function getContactDetail(db: Db, id: string) {
  const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).limit(1);
  if (!contact) return null;

  const identities = await db
    .select({ id: schema.contactIdentities.id, externalId: schema.contactIdentities.externalId, displayName: schema.contactIdentities.displayName, channelType: schema.channels.type, channelName: schema.channels.name })
    .from(schema.contactIdentities)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.contactIdentities.channelId))
    .where(eq(schema.contactIdentities.contactId, id));
  const tags = await db
    .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
    .from(schema.contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .where(eq(schema.contactTags.contactId, id))
    .orderBy(asc(schema.tags.name));
  const conversations = await db
    .select({ id: schema.conversations.id, status: schema.conversations.status, lastMessageAt: schema.conversations.lastMessageAt, preview: schema.conversations.lastMessagePreview, channelType: schema.channels.type })
    .from(schema.conversations)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.conversations.channelId))
    .where(eq(schema.conversations.contactId, id))
    .orderBy(desc(schema.conversations.lastMessageAt));
  return { contact, identities, tags, conversations };
}

export async function listTagsWithCounts(db: Db) {
  const t = schema.tags;
  return db
    .select({ id: t.id, name: t.name, color: t.color, count: sql<number>`(select count(*)::int from ${schema.contactTags} where ${schema.contactTags.tagId} = ${t.id})` })
    .from(t)
    .orderBy(asc(t.name));
}

/** Candidates to merge into the current contact (excludes itself). */
export async function searchContactsForMerge(db: Db, q: string, excludeId: string) {
  const r = await listContacts(db, { q });
  return r.items.filter((i) => i.id !== excludeId).slice(0, 10);
}
