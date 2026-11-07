import { and, asc, eq, exists, inArray, lt, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { placeholderCount, renderTemplate, templateBodyText, type SendTemplateInput } from "@/channels/whatsapp/templates";
import { publishInboxEvent } from "@/core/inbox/events";
import type { Db } from "@/core/inbox/ingest";

// WhatsApp template broadcasts. Safety first, because a mistake here costs money and can get
// the business number restricted by WhatsApp:
//  - only to contacts who explicitly opted in (re-checked at send time, so a "STOP" that
//    arrives mid-broadcast is honoured);
//  - only an APPROVED template, only on a WhatsApp channel with a token;
//  - the recipient list is frozen at creation and a hard cap applies;
//  - starting requires typing the exact recipient count, and real (non-test) channels also
//    need ALLOW_BROADCAST=true on the server;
//  - sending is resumable (one row per recipient) and pauses itself when failures pile up
//    or Meta reports a template/rate problem.

export type ParamSpec = { kind: "fixed"; value: string } | { kind: "first_name"; fallback: string };

export const DEFAULT_MAX_RECIPIENTS = 1000;
/** Pause automatically after this many sends if more than FAILURE_RATIO failed. */
export const AUTO_PAUSE_MIN_SAMPLE = 20;
export const AUTO_PAUSE_FAILURE_RATIO = 0.3;
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 5 * 60 * 1000;

// Meta error codes that mean "stop, something is wrong with the template or our limits",
// not "this one recipient failed". (From Meta's error-code list as I know it; not verified
// against the docs for this project.)
const STOP_CODES = new Set([130429, 131048, 131056, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 133010]);

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const maxRecipients = (env: Record<string, string | undefined> = process.env) => {
  const n = Number(env.BROADCAST_MAX_RECIPIENTS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_RECIPIENTS;
};

/** WhatsApp numbers only (a business-scoped id cannot be messaged with a template yet). */
const PHONE = /^\d{8,15}$/;

export interface EligibleRecipient {
  contactId: string;
  identityId: string;
  toNumber: string;
  name: string | null;
}

/** Who a broadcast on this channel would reach: opted-in contacts with a WhatsApp number (optionally tagged). */
export async function eligibleRecipients(db: Db, channelId: string, tagId?: string | null): Promise<EligibleRecipient[]> {
  const ci = schema.contactIdentities;
  const c = schema.contacts;
  const rows = await db
    .select({ contactId: c.id, identityId: ci.id, toNumber: ci.externalId, name: c.name })
    .from(ci)
    .innerJoin(c, eq(c.id, ci.contactId))
    .where(
      and(
        eq(ci.channelId, channelId),
        eq(c.optedIn, true),
        tagId ? exists(db.select({ x: sql`1` }).from(schema.contactTags).where(and(eq(schema.contactTags.contactId, c.id), eq(schema.contactTags.tagId, tagId)))) : undefined,
      ),
    )
    .orderBy(asc(c.createdAt));
  const seen = new Set<string>();
  return rows.filter((r) => PHONE.test(r.toNumber) && !seen.has(r.contactId) && !!seen.add(r.contactId));
}

export interface CreateBroadcastInput {
  name: string;
  channelId: string;
  templateId: string;
  tagId?: string | null;
  params: ParamSpec[];
  createdBy?: string | null;
}

export async function createBroadcast(db: Db, input: CreateBroadcastInput, env: Record<string, string | undefined> = process.env): Promise<Result<{ broadcastId: string; total: number }>> {
  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, error: "নাম ১–১২০ অক্ষরের হতে হবে।" };

  const [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, input.channelId)).limit(1);
  if (!channel || channel.type !== "whatsapp") return { ok: false, error: "একটি WhatsApp চ্যানেল বেছে নিন।" };
  if (channel.status !== "active" || !channel.accessTokenEncrypted) return { ok: false, error: "চ্যানেল সক্রিয় বা সংযুক্ত নয়।" };

  const [template] = await db.select().from(schema.templates).where(eq(schema.templates.id, input.templateId)).limit(1);
  if (!template || template.channelId !== channel.id) return { ok: false, error: "টেমপ্লেট পাওয়া যায়নি।" };
  if (template.status !== "approved") return { ok: false, error: "শুধু Meta-র অনুমোদিত (approved) টেমপ্লেট পাঠানো যায়।" };

  const needed = placeholderCount(templateBodyText(template.components));
  if (input.params.length !== needed) return { ok: false, error: `টেমপ্লেটে ${needed}টি ভেরিয়েবল আছে, মান দিতে হবে ঠিক ${needed}টি।` };
  if (input.params.some((p) => (p.kind === "fixed" ? !p.value.trim() : !p.fallback.trim()))) return { ok: false, error: "ভেরিয়েবলের মান খালি রাখা যাবে না।" };

  const recipients = await eligibleRecipients(db, channel.id, input.tagId);
  if (recipients.length === 0) return { ok: false, error: "সম্মতি (opt-in) দেওয়া কোনো প্রাপক পাওয়া যায়নি।" };
  const cap = maxRecipients(env);
  if (recipients.length > cap) return { ok: false, error: `প্রাপক ${recipients.length}জন, সীমা ${cap}। ট্যাগ দিয়ে ছোট করুন বা সীমা বাড়ান।` };

  const id = await db.transaction(async (tx) => {
    const [b] = await tx
      .insert(schema.broadcasts)
      .values({ name, channelId: channel.id, templateId: template.id, tagId: input.tagId ?? null, params: input.params, totalCount: recipients.length, createdBy: input.createdBy ?? null })
      .returning({ id: schema.broadcasts.id });
    for (let i = 0; i < recipients.length; i += 500) {
      await tx.insert(schema.broadcastRecipients).values(
        recipients.slice(i, i + 500).map((r) => ({ broadcastId: b.id, contactId: r.contactId, identityId: r.identityId, toNumber: r.toNumber })),
      );
    }
    return b.id;
  });
  return { ok: true, broadcastId: id, total: recipients.length };
}

export const isBroadcastAllowedOnRealChannels = (env: Record<string, string | undefined> = process.env) => env.ALLOW_BROADCAST === "true";

/**
 * Starts (or resumes) a broadcast. The caller must pass the exact recipient count the admin
 * typed as confirmation. A broadcast on a real (non-test) channel also needs ALLOW_BROADCAST=true.
 */
export async function startBroadcast(db: Db, id: string, confirmCount: number, env: Record<string, string | undefined> = process.env): Promise<Result> {
  const b = schema.broadcasts;
  const [row] = await db
    .select({ broadcast: b, isTest: schema.channels.isTest })
    .from(b)
    .innerJoin(schema.channels, eq(schema.channels.id, b.channelId))
    .where(eq(b.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Broadcast পাওয়া যায়নি।" };
  if (row.broadcast.status !== "draft" && row.broadcast.status !== "paused") return { ok: false, error: "এই broadcast আর শুরু করা যায় না।" };
  if (confirmCount !== row.broadcast.totalCount) return { ok: false, error: `নিশ্চিত করতে প্রাপকের সংখ্যা (${row.broadcast.totalCount}) ঠিক লিখুন।` };
  if (!row.isTest && !isBroadcastAllowedOnRealChannels(env)) {
    return { ok: false, error: "আসল চ্যানেলে broadcast বন্ধ আছে (ALLOW_BROADCAST)। শুধু টেস্ট চ্যানেলে পাঠানো যায়।" };
  }
  await db.update(b).set({ status: "sending", pauseReason: null, startedAt: row.broadcast.startedAt ?? new Date() }).where(eq(b.id, id));
  return { ok: true };
}

export async function pauseBroadcast(db: Db, id: string, reason = "অ্যাডমিন থামিয়েছেন"): Promise<Result> {
  const b = schema.broadcasts;
  const done = await db.update(b).set({ status: "paused", pauseReason: reason }).where(and(eq(b.id, id), eq(b.status, "sending"))).returning({ id: b.id });
  return done.length ? { ok: true } : { ok: false, error: "শুধু চলমান broadcast থামানো যায়।" };
}

/** Cancels for good: everything not yet sent is skipped. */
export async function cancelBroadcast(db: Db, id: string): Promise<Result> {
  const b = schema.broadcasts;
  const r = schema.broadcastRecipients;
  const [row] = await db.select({ status: b.status }).from(b).where(eq(b.id, id)).limit(1);
  if (!row) return { ok: false, error: "Broadcast পাওয়া যায়নি।" };
  if (row.status === "completed" || row.status === "cancelled") return { ok: false, error: "এই broadcast আগেই শেষ।" };
  await db.update(r).set({ status: "skipped", error: "বাতিল" }).where(and(eq(r.broadcastId, id), inArray(r.status, ["pending", "sending"])));
  await db.update(b).set({ status: "cancelled", finishedAt: new Date() }).where(eq(b.id, id));
  await refreshCounts(db, id);
  return { ok: true };
}

async function refreshCounts(db: Db, id: string) {
  const r = schema.broadcastRecipients;
  const rows = await db.select({ status: r.status, n: sql<number>`count(*)::int` }).from(r).where(eq(r.broadcastId, id)).groupBy(r.status);
  const n = (s: string) => rows.find((x) => x.status === s)?.n ?? 0;
  await db
    .update(schema.broadcasts)
    .set({ sentCount: n("sent"), failedCount: n("failed"), skippedCount: n("skipped") })
    .where(eq(schema.broadcasts.id, id));
  return { sent: n("sent"), failed: n("failed"), skipped: n("skipped"), pending: n("pending"), sending: n("sending") };
}

export interface ProcessDeps {
  sendTemplate: (input: SendTemplateInput) => Promise<{ externalId: string }>;
  now?: () => Date;
  /** Pause between sends to stay well under Meta's throughput. 0 in tests. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Stop after this long; the broadcast stays "sending" and can be continued. */
  maxMs?: number;
  batchSize?: number;
}

export interface ProcessResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  /** Set when the broadcast paused itself or finished. */
  state: "sending" | "paused" | "completed" | "cancelled" | "not_sending";
  reason?: string;
}

const firstName = (name: string | null) => name?.trim().split(/\s+/)[0] ?? "";

function resolveParams(specs: ParamSpec[], contactName: string | null): string[] {
  return specs.map((p) => (p.kind === "fixed" ? p.value : firstName(contactName) || p.fallback));
}

/** Errors worth retrying: network failures and Meta 5xx / 429. */
const isTransient = (err: unknown) => {
  const status = (err as { status?: number }).status;
  return status === undefined || status >= 500 || status === 429;
};

/**
 * Sends the next recipients of a "sending" broadcast. Safe to call repeatedly and from several
 * processes: each recipient is claimed with a conditional update, so nobody is messaged twice.
 */
export async function processBroadcast(db: Db, deps: ProcessDeps, id: string): Promise<ProcessResult> {
  const now = () => deps.now?.() ?? new Date();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (deps.maxMs ?? 50_000);
  const batchSize = deps.batchSize ?? 20;
  const b = schema.broadcasts;
  const r = schema.broadcastRecipients;
  const out: ProcessResult = { processed: 0, sent: 0, failed: 0, skipped: 0, state: "sending" };

  // Release recipients a crashed worker left claimed.
  await db.update(r).set({ status: "pending", claimedAt: null }).where(and(eq(r.broadcastId, id), eq(r.status, "sending"), lt(r.claimedAt, new Date(now().getTime() - STALE_CLAIM_MS))));

  for (;;) {
    const [row] = await db
      .select({ broadcast: b, channel: schema.channels, template: schema.templates })
      .from(b)
      .innerJoin(schema.channels, eq(schema.channels.id, b.channelId))
      .innerJoin(schema.templates, eq(schema.templates.id, b.templateId))
      .where(eq(b.id, id))
      .limit(1);
    if (!row) return { ...out, state: "not_sending" };
    if (row.broadcast.status !== "sending") return { ...out, state: row.broadcast.status === "draft" ? "not_sending" : (row.broadcast.status as ProcessResult["state"]) };

    // The template must still be approved (Meta may pause it mid-way).
    if (row.template.status !== "approved") {
      await db.update(b).set({ status: "paused", pauseReason: `টেমপ্লেটের অবস্থা এখন "${row.template.status}"` }).where(eq(b.id, id));
      return { ...out, state: "paused", reason: "template_not_approved" };
    }
    if (!row.channel.accessTokenEncrypted) {
      await db.update(b).set({ status: "paused", pauseReason: "চ্যানেলের টোকেন নেই" }).where(eq(b.id, id));
      return { ...out, state: "paused", reason: "no_token" };
    }

    const candidates = await db
      .select({ id: r.id })
      .from(r)
      .where(and(eq(r.broadcastId, id), eq(r.status, "pending")))
      .orderBy(asc(r.id))
      .limit(batchSize);
    if (candidates.length === 0) {
      const counts = await refreshCounts(db, id);
      if (counts.sending === 0) {
        await db.update(b).set({ status: "completed", finishedAt: now() }).where(eq(b.id, id));
        return { ...out, state: "completed" };
      }
      return out; // other workers still hold claims
    }

    // Claim: only rows still pending are ours.
    const claimed = await db
      .update(r)
      .set({ status: "sending", claimedAt: now() })
      .where(and(inArray(r.id, candidates.map((c) => c.id)), eq(r.status, "pending")))
      .returning({ id: r.id, contactId: r.contactId, toNumber: r.toNumber, attempts: r.attempts });

    const token = decryptSecret(row.channel.accessTokenEncrypted);
    const specs = (row.broadcast.params as ParamSpec[]) ?? [];
    const body = templateBodyText(row.template.components);
    let stopReason: string | undefined;

    for (const rec of claimed) {
      const [contact] = await db.select({ name: schema.contacts.name, optedIn: schema.contacts.optedIn }).from(schema.contacts).where(eq(schema.contacts.id, rec.contactId)).limit(1);
      out.processed++;

      // Honour a withdrawal that happened after the list was frozen.
      if (!contact || !contact.optedIn) {
        await db.update(r).set({ status: "skipped", error: "সম্মতি তুলে নিয়েছেন" }).where(eq(r.id, rec.id));
        out.skipped++;
        continue;
      }

      const params = resolveParams(specs, contact.name);
      try {
        const { externalId } = await deps.sendTemplate({ channelExternalId: row.channel.externalId, accessToken: token, to: rec.toNumber, name: row.template.name, language: row.template.language, bodyParams: params });
        await db.update(r).set({ status: "sent", externalId, sentAt: now(), attempts: rec.attempts + 1, error: null }).where(eq(r.id, rec.id));
        await recordInInbox(db, { channelId: row.channel.id, contactId: rec.contactId, to: rec.toNumber, externalId, text: renderTemplate(body, params), templateName: row.template.name, at: now() });
        out.sent++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "পাঠানো যায়নি";
        const code = (err as { code?: number }).code;
        if (isTransient(err) && rec.attempts + 1 < MAX_ATTEMPTS) {
          await db.update(r).set({ status: "pending", claimedAt: null, attempts: rec.attempts + 1, error: message }).where(eq(r.id, rec.id));
        } else {
          await db.update(r).set({ status: "failed", attempts: rec.attempts + 1, error: message }).where(eq(r.id, rec.id));
          out.failed++;
        }
        if (code !== undefined && STOP_CODES.has(code)) {
          stopReason = `Meta ত্রুটি ${code}: ${message}`;
          // Put the rest of this batch back untouched.
          await db.update(r).set({ status: "pending", claimedAt: null }).where(and(eq(r.broadcastId, id), eq(r.status, "sending")));
          break;
        }
      }
      if (deps.delayMs) await sleep(deps.delayMs);
    }

    const counts = await refreshCounts(db, id);

    // Too many failures: stop before burning through the whole list.
    const attempted = counts.sent + counts.failed;
    if (!stopReason && attempted >= AUTO_PAUSE_MIN_SAMPLE && counts.failed / attempted > AUTO_PAUSE_FAILURE_RATIO) {
      stopReason = `${attempted}টির মধ্যে ${counts.failed}টি ব্যর্থ, তাই নিজে থেকে থামানো হয়েছে`;
    }
    if (stopReason) {
      await db.update(b).set({ status: "paused", pauseReason: stopReason }).where(eq(b.id, id));
      return { ...out, state: "paused", reason: stopReason };
    }
    if (Date.now() >= deadline) return out; // continue on the next call
  }
}

/** Shows the sent template in the conversation, so staff see what the customer received. */
async function recordInInbox(db: Db, a: { channelId: string; contactId: string; to: string; externalId: string; text: string; templateName: string; at: Date }) {
  const ci = schema.contactIdentities;
  const [identity] = await db.select({ id: ci.id }).from(ci).where(and(eq(ci.channelId, a.channelId), eq(ci.externalId, a.to))).limit(1);
  if (!identity) return;
  const c = schema.conversations;
  // New conversations start closed: a broadcast must not fill the open inbox.
  await db.insert(c).values({ channelId: a.channelId, contactId: a.contactId, identityId: identity.id, status: "closed", lastMessageAt: a.at, lastMessagePreview: a.text.slice(0, 200) }).onConflictDoNothing({ target: [c.channelId, c.identityId] });
  const [conv] = await db.select({ id: c.id }).from(c).where(and(eq(c.channelId, a.channelId), eq(c.identityId, identity.id))).limit(1);
  if (!conv) return;
  const inserted = await db
    .insert(schema.messages)
    .values({ conversationId: conv.id, channelId: a.channelId, externalId: a.externalId, direction: "outbound", source: "api", type: "template", body: a.text, status: "sent", sentAt: a.at, raw: { template: a.templateName } })
    .onConflictDoNothing({ target: schema.messages.externalId })
    .returning({ id: schema.messages.id });
  if (inserted.length) {
    await db.update(c).set({ lastMessageAt: sql`greatest(${c.lastMessageAt}, ${a.at.toISOString()}::timestamptz)`, lastMessagePreview: a.text.slice(0, 200) }).where(eq(c.id, conv.id));
    publishInboxEvent({ type: "conversation", conversationId: conv.id });
  }
}
