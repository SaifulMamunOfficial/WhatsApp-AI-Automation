import { and, eq, inArray, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import type { TemplateStatusEvent } from "@/channels/types";
import {
  createTemplate,
  listTemplates,
  mapMetaStatus,
  type CreateTemplateInput,
  type MetaTemplate,
  type TemplateApiOptions,
} from "@/channels/whatsapp/templates";
import type { Db } from "@/core/inbox/ingest";

// Keeps our `templates` table in step with Meta: pull the list, create new ones, and apply
// status changes (approved / rejected / paused) that arrive by webhook.

export interface TemplateApi {
  list: (wabaId: string, token: string) => Promise<MetaTemplate[]>;
  create: (wabaId: string, token: string, input: CreateTemplateInput) => Promise<{ id: string; status: string }>;
}

export function graphTemplateApi(o: TemplateApiOptions = {}): TemplateApi {
  return {
    list: (waba, token) => listTemplates(waba, token, o),
    create: (waba, token, input) => createTemplate(waba, token, input, o),
  };
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function whatsappChannel(db: Db, channelId: string) {
  const [ch] = await db.select().from(schema.channels).where(eq(schema.channels.id, channelId)).limit(1);
  if (!ch || ch.type !== "whatsapp" || !ch.wabaId || !ch.accessTokenEncrypted) return null;
  return { ch, wabaId: ch.wabaId, token: decryptSecret(ch.accessTokenEncrypted) };
}

/** Imports/updates every template of the channel's WABA. Existing rows are updated in place. */
export async function syncTemplates(db: Db, api: Pick<TemplateApi, "list">, channelId: string): Promise<Result<{ synced: number }>> {
  const c = await whatsappChannel(db, channelId);
  if (!c) return { ok: false, error: "এই চ্যানেলে WhatsApp অ্যাকাউন্ট (WABA) বা টোকেন নেই।" };
  let remote: MetaTemplate[];
  try {
    remote = await api.list(c.wabaId, c.token);
  } catch (err) {
    return { ok: false, error: `Meta থেকে তালিকা আনা যায়নি: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}` };
  }
  for (const t of remote) {
    const values = { channelId, name: t.name, language: t.language, category: t.category.toLowerCase(), status: mapMetaStatus(t.status), metaTemplateId: t.id, components: t.components };
    await db
      .insert(schema.templates)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.templates.channelId, schema.templates.name, schema.templates.language],
        set: { category: values.category, status: values.status, metaTemplateId: values.metaTemplateId, components: values.components },
      });
  }
  return { ok: true, synced: remote.length };
}

/** Submits a new template to Meta (it starts "pending" until Meta reviews it). */
export async function submitTemplate(db: Db, api: Pick<TemplateApi, "create">, channelId: string, input: CreateTemplateInput): Promise<Result<{ templateId: string }>> {
  const c = await whatsappChannel(db, channelId);
  if (!c) return { ok: false, error: "এই চ্যানেলে WhatsApp অ্যাকাউন্ট (WABA) বা টোকেন নেই।" };
  let created: { id: string; status: string };
  try {
    created = await api.create(c.wabaId, c.token, input);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "টেমপ্লেট জমা দেওয়া যায়নি।" };
  }
  const [row] = await db
    .insert(schema.templates)
    .values({
      channelId,
      name: input.name,
      language: input.language,
      category: input.category,
      status: mapMetaStatus(created.status),
      metaTemplateId: created.id,
      components: [{ type: "BODY", text: input.bodyText }],
    })
    .onConflictDoUpdate({
      target: [schema.templates.channelId, schema.templates.name, schema.templates.language],
      set: { metaTemplateId: created.id, status: mapMetaStatus(created.status), category: input.category },
    })
    .returning({ id: schema.templates.id });
  return { ok: true, templateId: row.id };
}

/** Applies message_template_status_update webhooks. Returns how many templates changed. */
export async function applyTemplateStatusEvents(db: Db, events: TemplateStatusEvent[]): Promise<number> {
  let changed = 0;
  const t = schema.templates;
  for (const e of events) {
    const status = mapMetaStatus(e.event);
    const channelIds = (
      await db.select({ id: schema.channels.id }).from(schema.channels).where(eq(schema.channels.wabaId, e.wabaId))
    ).map((c) => c.id);
    if (channelIds.length === 0) continue;

    const byId = e.metaTemplateId ? eq(t.metaTemplateId, e.metaTemplateId) : undefined;
    const byName = e.name ? and(eq(t.name, e.name), e.language ? eq(t.language, e.language) : undefined) : undefined;
    const match = byId && byName ? or(byId, byName) : (byId ?? byName);
    if (!match) continue;

    const done = await db.update(t).set({ status }).where(and(inArray(t.channelId, channelIds), match)).returning({ id: t.id });
    changed += done.length;
  }
  return changed;
}

export async function approvedTemplates(db: Db, channelId: string) {
  return db
    .select()
    .from(schema.templates)
    .where(and(eq(schema.templates.channelId, channelId), eq(schema.templates.status, "approved")))
    .orderBy(sql`${schema.templates.name}`);
}
