import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import type { Db } from "./ingest";
import { calculateBusinessWaitMinutes, getSlaBadge, loadActiveHolidays, type SlaBadge } from "./sla";
import type { Locale } from "@/lib/i18n";

export interface InboxFilters {
  channelType?: "whatsapp" | "messenger";
  /** "me" and "unassigned" are relative to viewerId. */
  assigned?: "all" | "me" | "unassigned";
  status?: "open" | "closed" | "all";
  /** Only conversations the bot handed over to a person. */
  needsHuman?: boolean;
  unreplied?: boolean;
  stageId?: string;
  q?: string;
}

const LIST_LIMIT = 100;
const THREAD_LIMIT = 200;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const assignee = alias(schema.users, "assignee");

const conversationColumns = {
  id: schema.conversations.id,
  status: schema.conversations.status,
  botPaused: schema.conversations.botPaused,
  needsHuman: schema.conversations.needsHuman,
  unreadCount: schema.conversations.unreadCount,
  lastMessageAt: schema.conversations.lastMessageAt,
  lastMessagePreview: schema.conversations.lastMessagePreview,
  lastCustomerMessageAt: schema.conversations.lastCustomerMessageAt,
  lastOutboundMessageAt: schema.conversations.lastOutboundMessageAt,
  assignedUserId: schema.conversations.assignedUserId,
  assigneeName: assignee.name,
  channelId: schema.channels.id,
  channelType: schema.channels.type,
  channelName: schema.channels.name,
  contactId: schema.contacts.id,
  contactName: schema.contacts.name,
  stageId: schema.contacts.stageId,
  stageName: schema.lifecycleStages.name,
  stageColorKey: schema.lifecycleStages.colorKey,
  identityExternalId: schema.contactIdentities.externalId,
  identityDisplayName: schema.contactIdentities.displayName,
};

function baseQuery(db: Db) {
  return db
    .select(conversationColumns)
    .from(schema.conversations)
    .innerJoin(schema.channels, eq(schema.channels.id, schema.conversations.channelId))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .innerJoin(schema.contactIdentities, eq(schema.contactIdentities.id, schema.conversations.identityId))
    .leftJoin(schema.lifecycleStages, eq(schema.lifecycleStages.id, schema.contacts.stageId))
    .leftJoin(assignee, eq(assignee.id, schema.conversations.assignedUserId));
}

export async function listConversations(db: Db, filters: InboxFilters, viewerId: string, locale: Locale = "bn") {
  const where: (SQL | undefined)[] = [];
  if (filters.channelType) where.push(eq(schema.channels.type, filters.channelType));

  if (filters.assigned === "me") where.push(eq(schema.conversations.assignedUserId, viewerId));
  else if (filters.assigned === "unassigned") where.push(sql`${schema.conversations.assignedUserId} is null`);

  if (filters.needsHuman) where.push(eq(schema.conversations.needsHuman, true));

  if (filters.unreplied) {
    where.push(
      eq(schema.conversations.status, "open"),
      sql`${schema.conversations.lastCustomerMessageAt} IS NOT NULL`,
      or(
        sql`${schema.conversations.lastOutboundMessageAt} IS NULL`,
        sql`${schema.conversations.lastCustomerMessageAt} > ${schema.conversations.lastOutboundMessageAt}`,
      ),
    );
  }

  if (filters.stageId) {
    where.push(eq(schema.contacts.stageId, filters.stageId));
  }

  const status = filters.status ?? "open";
  if (status !== "all") where.push(eq(schema.conversations.status, status));

  const q = filters.q?.trim();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    where.push(
      or(
        ilike(schema.contacts.name, like),
        ilike(schema.contactIdentities.externalId, like),
        ilike(schema.contactIdentities.displayName, like),
        ilike(schema.conversations.lastMessagePreview, like),
      ),
    );
  }

  const rows = await baseQuery(db)
    .where(and(...where))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(LIST_LIMIT);

  const holidays = await loadActiveHolidays(db);
  const now = new Date();

  return rows.map((c) => {
    const isUnreplied =
      c.status === "open" &&
      !!c.lastCustomerMessageAt &&
      (!c.lastOutboundMessageAt || c.lastCustomerMessageAt > c.lastOutboundMessageAt);

    const sla: SlaBadge | null = isUnreplied && c.lastCustomerMessageAt
      ? getSlaBadge(calculateBusinessWaitMinutes(c.lastCustomerMessageAt, now, undefined, holidays), locale)
      : null;

    return {
      ...c,
      isUnreplied,
      sla,
    };
  });
}

export async function getInboxUnrepliedCount(db: Db): Promise<number> {
  const [res] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.conversations)
    .where(
      and(
        eq(schema.conversations.status, "open"),
        sql`${schema.conversations.lastCustomerMessageAt} IS NOT NULL`,
        or(
          sql`${schema.conversations.lastOutboundMessageAt} IS NULL`,
          sql`${schema.conversations.lastCustomerMessageAt} > ${schema.conversations.lastOutboundMessageAt}`,
        ),
      ),
    );
  return Number(res?.count ?? 0);
}

export async function getConversation(db: Db, id: string, locale: Locale = "bn") {
  const [conversation] = await baseQuery(db).where(eq(schema.conversations.id, id)).limit(1);
  if (!conversation) return null;

  const holidays = await loadActiveHolidays(db);
  const now = new Date();
  const isUnreplied =
    conversation.status === "open" &&
    !!conversation.lastCustomerMessageAt &&
    (!conversation.lastOutboundMessageAt || conversation.lastCustomerMessageAt > conversation.lastOutboundMessageAt);

  const sla: SlaBadge | null = isUnreplied && conversation.lastCustomerMessageAt
    ? getSlaBadge(calculateBusinessWaitMinutes(conversation.lastCustomerMessageAt, now, undefined, holidays), locale)
    : null;

  // Latest N messages, shown oldest-first.
  const latest = await db
    .select({
      id: schema.messages.id,
      direction: schema.messages.direction,
      source: schema.messages.source,
      type: schema.messages.type,
      body: schema.messages.body,
      status: schema.messages.status,
      error: schema.messages.error,
      sentByBot: schema.messages.sentByBot,
      sentByUserName: schema.users.name,
      sentAt: schema.messages.sentAt,
      mediaId: schema.messageMedia.id,
      mediaStatus: schema.messageMedia.status,
      mediaMime: schema.messageMedia.mimeType,
      mediaName: schema.messageMedia.fileName,
      mediaSize: schema.messageMedia.sizeBytes,
      mediaError: schema.messageMedia.error,
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.users.id, schema.messages.sentByUserId))
    .leftJoin(schema.messageMedia, eq(schema.messageMedia.messageId, schema.messages.id))
    .where(eq(schema.messages.conversationId, id))
    .orderBy(desc(schema.messages.sentAt))
    .limit(THREAD_LIMIT);

  const notes = await db
    .select({
      id: schema.conversationNotes.id,
      body: schema.conversationNotes.body,
      createdAt: schema.conversationNotes.createdAt,
      userName: schema.users.name,
    })
    .from(schema.conversationNotes)
    .leftJoin(schema.users, eq(schema.users.id, schema.conversationNotes.userId))
    .where(eq(schema.conversationNotes.conversationId, id))
    .orderBy(asc(schema.conversationNotes.createdAt));

  const contactTags = await db
    .select({ id: schema.tags.id, name: schema.tags.name, color: schema.tags.color })
    .from(schema.contactTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.contactTags.tagId))
    .where(eq(schema.contactTags.contactId, conversation.contactId))
    .orderBy(asc(schema.tags.name));

  return {
    conversation: { ...conversation, isUnreplied, sla },
    messages: latest.reverse(),
    notes,
    contactTags,
  };
}

/** What the "send a template" panel needs: the channel's approved templates and whether the contact opted in. */
export async function getTemplatePanelData(db: Db, channelId: string, contactId: string) {
  const [templates, [contact]] = await Promise.all([
    db
      .select({ id: schema.templates.id, name: schema.templates.name, language: schema.templates.language, category: schema.templates.category, components: schema.templates.components })
      .from(schema.templates)
      .where(and(eq(schema.templates.channelId, channelId), eq(schema.templates.status, "approved")))
      .orderBy(asc(schema.templates.name)),
    db.select({ optedIn: schema.contacts.optedIn }).from(schema.contacts).where(eq(schema.contacts.id, contactId)).limit(1),
  ]);
  return { templates, optedIn: !!contact?.optedIn };
}

export async function listAssignableUsers(db: Db) {
  return db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.active, true))
    .orderBy(asc(schema.users.name));
}

export type ConversationRow = Awaited<ReturnType<typeof listConversations>>[number];
export type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversation>>>;
