import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import type { Db } from "./ingest";

export interface InboxFilters {
  channelType?: "whatsapp" | "messenger";
  /** "me" and "unassigned" are relative to viewerId. */
  assigned?: "all" | "me" | "unassigned";
  status?: "open" | "closed" | "all";
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
  unreadCount: schema.conversations.unreadCount,
  lastMessageAt: schema.conversations.lastMessageAt,
  lastMessagePreview: schema.conversations.lastMessagePreview,
  lastCustomerMessageAt: schema.conversations.lastCustomerMessageAt,
  assignedUserId: schema.conversations.assignedUserId,
  assigneeName: assignee.name,
  channelId: schema.channels.id,
  channelType: schema.channels.type,
  channelName: schema.channels.name,
  contactId: schema.contacts.id,
  contactName: schema.contacts.name,
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
    .leftJoin(assignee, eq(assignee.id, schema.conversations.assignedUserId));
}

export async function listConversations(db: Db, filters: InboxFilters, viewerId: string) {
  const where: (SQL | undefined)[] = [];
  if (filters.channelType) where.push(eq(schema.channels.type, filters.channelType));

  if (filters.assigned === "me") where.push(eq(schema.conversations.assignedUserId, viewerId));
  else if (filters.assigned === "unassigned") where.push(sql`${schema.conversations.assignedUserId} is null`);

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

  return baseQuery(db)
    .where(and(...where))
    .orderBy(desc(schema.conversations.lastMessageAt))
    .limit(LIST_LIMIT);
}

export async function getConversation(db: Db, id: string) {
  const [conversation] = await baseQuery(db).where(eq(schema.conversations.id, id)).limit(1);
  if (!conversation) return null;

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
    })
    .from(schema.messages)
    .leftJoin(schema.users, eq(schema.users.id, schema.messages.sentByUserId))
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

  return { conversation, messages: latest.reverse(), notes };
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
