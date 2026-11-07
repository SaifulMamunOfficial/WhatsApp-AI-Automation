import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { ingestEvents } from "@/core/inbox/ingest";
import { isOptOutText, setOptIn } from "@/core/contacts/consent";
import { applyTemplateStatusEvents, submitTemplate, syncTemplates } from "@/core/broadcast/templates";
import {
  AUTO_PAUSE_MIN_SAMPLE, cancelBroadcast, createBroadcast, eligibleRecipients, pauseBroadcast, processBroadcast,
  startBroadcast, type ParamSpec, type ProcessDeps,
} from "@/core/broadcast/engine";
import { MetaApiError } from "@/channels/whatsapp/coexistence";
import { WhatsAppSendError } from "@/channels/whatsapp/sender";
import { parseWhatsAppWebhook } from "@/channels/whatsapp/parser";
import { createTemplate, listTemplates, mapMetaStatus, placeholderCount, renderTemplate, sendWhatsAppTemplate, templateBodyText } from "@/channels/whatsapp/templates";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let channelId: string;
let templateId: string;
const GHOST = "00000000-0000-0000-0000-000000000000";

beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "7".repeat(64);
  t = await createTestDb();
}, 60_000);
afterAll(async () => t.close());

beforeEach(async () => {
  await t.db.delete(schema.broadcasts);
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.tags);
  await t.db.delete(schema.templates);
  await t.db.delete(schema.channels);
  [{ id: channelId }] = await t.db
    .insert(schema.channels)
    .values({ type: "whatsapp", name: "WA", externalId: "PNID", wabaId: "1000", status: "active", accessTokenEncrypted: encryptSecret("TOK"), isTest: true })
    .returning({ id: schema.channels.id });
  [{ id: templateId }] = await t.db
    .insert(schema.templates)
    .values({ channelId, name: "offer", language: "bn", category: "marketing", status: "approved", metaTemplateId: "T1", components: [{ type: "BODY", text: "হ্যালো {{1}}, অফার: {{2}}" }] })
    .returning({ id: schema.templates.id });
});

async function addContact(phone: string, name: string | null, optedIn: boolean) {
  const [c] = await t.db.insert(schema.contacts).values({ name, optedIn }).returning({ id: schema.contacts.id });
  await t.db.insert(schema.contactIdentities).values({ contactId: c.id, channelId, externalId: phone });
  return c.id;
}
const PARAMS: ParamSpec[] = [{ kind: "first_name", fallback: "গ্রাহক" }, { kind: "fixed", value: "২০% ছাড়" }];
const mk = (over: Partial<Parameters<typeof createBroadcast>[1]> = {}) => createBroadcast(t.db, { name: "Eid", channelId, templateId, params: PARAMS, ...over });
const recipients = () => t.db.select().from(schema.broadcastRecipients);
const bc = async () => (await t.db.select().from(schema.broadcasts))[0];

function deps(over: Partial<ProcessDeps> = {}) {
  const send = vi.fn().mockImplementation(async () => ({ externalId: `wamid.${Math.random()}` }));
  return { send, d: { sendTemplate: send, delayMs: 0, ...over } as ProcessDeps };
}
async function startAndGet(confirm?: number) {
  const r = await mk();
  if (!r.ok) throw new Error(r.error);
  expect((await startBroadcast(t.db, r.broadcastId, confirm ?? r.total)).ok).toBe(true);
  return r.broadcastId;
}

describe("template helpers", () => {
  it("counts placeholders, renders them, reads the body and maps statuses", () => {
    expect(placeholderCount("a {{1}} b {{ 2 }} c {{1}}")).toBe(2);
    expect(placeholderCount("no vars")).toBe(0);
    expect(renderTemplate("হ্যালো {{1}}, {{2}}", ["রহিম"])).toBe("হ্যালো রহিম, ");
    expect(templateBodyText([{ type: "HEADER", text: "h" }, { type: "BODY", text: "body" }])).toBe("body");
    expect(templateBodyText(undefined)).toBe("");
    expect(["APPROVED", "PENDING", "PAUSED", "REJECTED", "DISABLED", "IN_APPEAL", "WHAT"].map(mapMetaStatus)).toEqual(["approved", "pending", "paused", "rejected", "rejected", "pending", "pending"]);
  });
});

describe("template API client", () => {
  const ok = (body: unknown, status = 200) => vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status }));

  it("creates a template with positional examples and validates before calling Meta", async () => {
    const f = ok({ id: "99", status: "PENDING", category: "MARKETING" });
    const r = await createTemplate("1000", "TOK", { name: "offer_1", language: "bn", category: "marketing", bodyText: "Hi {{1}}, {{2}}", examples: ["Rahim", "10%"] }, { graphVersion: "v23.0", fetchImpl: f });
    expect(r).toEqual({ id: "99", status: "PENDING" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/1000/message_templates");
    expect(init.headers.Authorization).toBe("Bearer TOK");
    expect(JSON.parse(init.body)).toEqual({ name: "offer_1", language: "bn", category: "marketing", parameter_format: "positional", components: [{ type: "body", text: "Hi {{1}}, {{2}}", example: { body_text: [["Rahim", "10%"]] } }] });

    const none = vi.fn();
    await expect(createTemplate("1", "T", { name: "Bad Name", language: "bn", category: "utility", bodyText: "x", examples: [] }, { fetchImpl: none })).rejects.toThrow(MetaApiError);
    await expect(createTemplate("1", "T", { name: "ok", language: "bn", category: "utility", bodyText: "{{1}} {{2}}", examples: ["a"] }, { fetchImpl: none })).rejects.toThrow(/ঠিক 2টি/);
    expect(none).not.toHaveBeenCalled();
  });

  it("lists templates across pages and ignores malformed entries", async () => {
    const f = vi.fn()
      .mockImplementationOnce(async () => new Response(JSON.stringify({ data: [{ id: "1", name: "a", language: "bn", status: "APPROVED", category: "MARKETING", components: [] }, { name: "no-id" }], paging: { next: "https://graph.facebook.com/next" } })))
      .mockImplementationOnce(async () => new Response(JSON.stringify({ data: [{ id: "2", name: "b", language: "en", status: "PAUSED", category: "UTILITY" }] })));
    const list = await listTemplates("1000", "TOK", { fetchImpl: f });
    expect(list.map((x) => x.name)).toEqual(["a", "b"]);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1][0]).toBe("https://graph.facebook.com/next");
  });

  it("sends a template with body parameters (or none), token only in the header", async () => {
    const f = ok({ messages: [{ id: "wamid.X" }] });
    const r = await sendWhatsAppTemplate({ channelExternalId: "PN", accessToken: "TOK", to: "8801711000001", name: "offer", language: "bn", bodyParams: ["রহিম", "১০%"] }, { graphVersion: "v23.0", fetchImpl: f });
    expect(r).toEqual({ externalId: "wamid.X" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/PN/messages");
    expect(url).not.toContain("TOK");
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "8801711000001", type: "template", template: { name: "offer", language: { code: "bn" }, components: [{ type: "body", parameters: [{ type: "text", text: "রহিম" }, { type: "text", text: "১০%" }] }] } });
    await sendWhatsAppTemplate({ channelExternalId: "PN", accessToken: "T", to: "1", name: "n", language: "bn", bodyParams: [] }, { fetchImpl: f });
    expect(JSON.parse(f.mock.calls[1][1].body).template).toEqual({ name: "n", language: { code: "bn" } });

    const err = await sendWhatsAppTemplate({ channelExternalId: "PN", accessToken: "SECRET", to: "1", name: "n", language: "bn", bodyParams: [] }, { fetchImpl: ok({ error: { message: "Template paused", code: 132015 } }, 400) }).catch((e) => e);
    expect(err).toBeInstanceOf(WhatsAppSendError);
    expect(err).toMatchObject({ status: 400, code: 132015 });
    expect(err.message).not.toContain("SECRET");
  });
});

describe("template sync and status webhooks", () => {
  it("syncs from Meta (upsert in place) and submits new templates as pending", async () => {
    const api = { list: vi.fn().mockResolvedValue([{ id: "T1", name: "offer", language: "bn", status: "PAUSED", category: "MARKETING", components: [{ type: "BODY", text: "new {{1}}" }] }, { id: "T9", name: "other", language: "en", status: "APPROVED", category: "UTILITY", components: [] }]) };
    expect(await syncTemplates(t.db, api, channelId)).toEqual({ ok: true, synced: 2 });
    const all = await t.db.select().from(schema.templates);
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.name === "offer")).toMatchObject({ status: "paused", id: templateId }); // same row, updated
    expect(all.find((x) => x.name === "other")).toMatchObject({ status: "approved", category: "utility" });
    expect(await syncTemplates(t.db, { list: vi.fn().mockRejectedValue(new Error("down")) }, channelId)).toMatchObject({ ok: false });
    expect(await syncTemplates(t.db, api, GHOST)).toMatchObject({ ok: false });

    const created = await submitTemplate(t.db, { create: vi.fn().mockResolvedValue({ id: "T2", status: "PENDING" }) }, channelId, { name: "fresh", language: "bn", category: "utility", bodyText: "x", examples: [] });
    expect(created.ok).toBe(true);
    expect((await t.db.select().from(schema.templates)).find((x) => x.name === "fresh")).toMatchObject({ status: "pending", metaTemplateId: "T2" });
  });

  it("applies status-update webhooks by template id or by name+language within the right account", async () => {
    const payload = (value: object) => ({ object: "whatsapp_business_account", entry: [{ id: "1000", changes: [{ field: "message_template_status_update", value }] }] });
    const evt = parseWhatsAppWebhook(payload({ event: "PAUSED", message_template_id: "T1", message_template_name: "offer", message_template_language: "bn", reason: "NONE" }));
    expect(evt.templateStatus).toEqual([{ wabaId: "1000", metaTemplateId: "T1", name: "offer", language: "bn", event: "PAUSED", reason: "NONE" }]);
    expect(await applyTemplateStatusEvents(t.db, evt.templateStatus!)).toBe(1);
    expect((await t.db.select().from(schema.templates))[0].status).toBe("paused");

    await applyTemplateStatusEvents(t.db, [{ wabaId: "1000", name: "offer", language: "bn", event: "APPROVED" }]);
    expect((await t.db.select().from(schema.templates))[0].status).toBe("approved");
    expect(await applyTemplateStatusEvents(t.db, [{ wabaId: "OTHER", metaTemplateId: "T1", event: "REJECTED" }])).toBe(0); // other account: untouched
    expect(parseWhatsAppWebhook(payload({ message_template_id: "x" })).templateStatus).toBeUndefined(); // no event
  });

  it("an ingest of a status webhook updates the template", async () => {
    const events = parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ id: "1000", changes: [{ field: "message_template_status_update", value: { event: "REJECTED", message_template_id: "T1" } }] }] });
    const r = await ingestEvents(t.db, events);
    expect(r.templatesUpdated).toBe(1);
    expect((await t.db.select().from(schema.templates))[0].status).toBe("rejected");
  });
});

describe("consent (opt-in / opt-out)", () => {
  it("recognizes stop words only as a whole message", () => {
    for (const w of ["STOP", " stop ", "Unsubscribe", "opt out", "স্টপ", "আনসাবস্ক্রাইব", "stop!"]) expect(isOptOutText(w)).toBe(true);
    for (const w of ["please don't stop", "বন্ধ", "বাস স্টপ কোথায়", "", null, undefined]) expect(isOptOutText(w)).toBe(false);
  });

  it("a customer replying STOP is opted out, with the source recorded; others are unaffected", async () => {
    const a = await addContact("8801711000001", "A", true);
    const b = await addContact("8801711000002", "B", true);
    const msg = (phone: string, text: string) => ({ channelType: "whatsapp" as const, channelExternalId: "PNID", externalId: `m-${phone}-${text}`, contactExternalId: phone, direction: "inbound" as const, source: "api" as const, type: "text", text, timestamp: new Date() });
    const r = await ingestEvents(t.db, { statuses: [], messages: [msg("8801711000001", "STOP"), msg("8801711000002", "ধন্যবাদ")] });
    expect(r.optedOut).toBe(1);
    const rows = await t.db.select().from(schema.contacts);
    expect(rows.find((x) => x.id === a)).toMatchObject({ optedIn: false, optInSource: "customer_stop" });
    expect(rows.find((x) => x.id === b)!.optedIn).toBe(true);
  });

  it("setOptIn records the time and source; unknown contacts are reported", async () => {
    const c = await addContact("8801711000001", "A", false);
    expect((await setOptIn(t.db, c, true, "manual")).ok).toBe(true);
    const [row] = await t.db.select().from(schema.contacts).where(eq(schema.contacts.id, c));
    expect(row).toMatchObject({ optedIn: true, optInSource: "manual" });
    expect(row.optedInAt).toBeInstanceOf(Date);
    expect((await setOptIn(t.db, GHOST, true, "manual")).ok).toBe(false);
  });
});

describe("eligibleRecipients / createBroadcast", () => {
  it("includes only opted-in contacts with a real phone number, once each", async () => {
    await addContact("8801711000001", "Yes", true);
    await addContact("8801711000002", "NotOptedIn", false);
    await addContact("US.13491208655302741918", "Bsuid", true); // business-scoped id: cannot be messaged with a template
    const dup = await addContact("8801711000003", "Two numbers", true);
    await t.db.insert(schema.contactIdentities).values({ contactId: dup, channelId, externalId: "8801711000099" });
    const list = await eligibleRecipients(t.db, channelId);
    expect(list.map((r) => r.name).sort()).toEqual(["Two numbers", "Yes"]);
  });

  it("filters by tag", async () => {
    const a = await addContact("8801711000001", "Tagged", true);
    await addContact("8801711000002", "Untagged", true);
    const [tag] = await t.db.insert(schema.tags).values({ name: "VIP" }).returning({ id: schema.tags.id });
    await t.db.insert(schema.contactTags).values({ contactId: a, tagId: tag.id });
    expect((await eligibleRecipients(t.db, channelId, tag.id)).map((r) => r.name)).toEqual(["Tagged"]);
  });

  it("freezes the recipient list on creation", async () => {
    await addContact("8801711000001", "A", true);
    await addContact("8801711000002", "B", true);
    const r = await mk();
    expect(r).toMatchObject({ ok: true, total: 2 });
    await addContact("8801711000003", "Late", true); // joins after: not part of this broadcast
    expect(await recipients()).toHaveLength(2);
    expect(await bc()).toMatchObject({ status: "draft", totalCount: 2 });
  });

  it("refuses: no opted-in recipients, unapproved template, wrong variable count, empty values, oversized list, non-WhatsApp channel", async () => {
    expect(await mk()).toMatchObject({ ok: false, error: expect.stringContaining("সম্মতি") });
    await addContact("8801711000001", "A", true);
    await t.db.update(schema.templates).set({ status: "pending" });
    expect(await mk()).toMatchObject({ ok: false, error: expect.stringContaining("approved") });
    await t.db.update(schema.templates).set({ status: "approved" });
    expect(await mk({ params: [{ kind: "fixed", value: "x" }] })).toMatchObject({ ok: false, error: expect.stringContaining("ঠিক 2টি") });
    expect(await mk({ params: [{ kind: "fixed", value: " " }, { kind: "fixed", value: "y" }] })).toMatchObject({ ok: false });
    await addContact("8801711000002", "B", true);
    expect(await createBroadcast(t.db, { name: "x", channelId, templateId, params: PARAMS }, { BROADCAST_MAX_RECIPIENTS: "1" })).toMatchObject({ ok: false, error: expect.stringContaining("সীমা 1") });
    expect(await mk({ name: "  " })).toMatchObject({ ok: false });
    const [fb] = await t.db.insert(schema.channels).values({ type: "messenger", name: "FB", externalId: "P", status: "active", accessTokenEncrypted: encryptSecret("x") }).returning({ id: schema.channels.id });
    expect(await mk({ channelId: fb.id })).toMatchObject({ ok: false });
    expect(await mk({ templateId: GHOST })).toMatchObject({ ok: false });
    expect(await t.db.select().from(schema.broadcasts)).toHaveLength(0);
  });
});

describe("startBroadcast safeguards", () => {
  beforeEach(async () => {
    await addContact("8801711000001", "A", true);
    await addContact("8801711000002", "B", true);
  });

  it("needs the exact recipient count typed as confirmation", async () => {
    const r = (await mk()) as { broadcastId: string };
    expect((await startBroadcast(t.db, r.broadcastId, 1)).ok).toBe(false);
    expect((await startBroadcast(t.db, r.broadcastId, 3)).ok).toBe(false);
    expect((await bc()).status).toBe("draft");
    expect((await startBroadcast(t.db, r.broadcastId, 2)).ok).toBe(true);
    expect((await bc())).toMatchObject({ status: "sending" });
    expect((await startBroadcast(t.db, r.broadcastId, 2)).ok).toBe(false); // already running
    expect((await startBroadcast(t.db, GHOST, 2)).ok).toBe(false);
  });

  it("a real (non-test) channel also needs ALLOW_BROADCAST=true", async () => {
    await t.db.update(schema.channels).set({ isTest: false });
    const r = (await mk()) as { broadcastId: string };
    expect(await startBroadcast(t.db, r.broadcastId, 2, {})).toMatchObject({ ok: false, error: expect.stringContaining("ALLOW_BROADCAST") });
    expect((await bc()).status).toBe("draft");
    expect((await startBroadcast(t.db, r.broadcastId, 2, { ALLOW_BROADCAST: "true" })).ok).toBe(true);
  });
});

describe("processBroadcast", () => {
  it("sends the template with resolved variables, records it in the inbox, and completes", async () => {
    await addContact("8801711000001", "রহিম উদ্দিন", true);
    await addContact("8801711000002", null, true); // no name: fallback
    const id = await startAndGet();
    const { send, d } = deps();
    const r = await processBroadcast(t.db, d, id);
    expect(r).toMatchObject({ sent: 2, failed: 0, state: "completed" });

    const calls = send.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => c.to).sort()).toEqual(["8801711000001", "8801711000002"]);
    expect(calls.find((c) => c.to === "8801711000001").bodyParams).toEqual(["রহিম", "২০% ছাড়"]);
    expect(calls.find((c) => c.to === "8801711000002").bodyParams).toEqual(["গ্রাহক", "২০% ছাড়"]);
    expect(calls[0]).toMatchObject({ name: "offer", language: "bn", accessToken: "TOK", channelExternalId: "PNID" });

    expect(await bc()).toMatchObject({ status: "completed", sentCount: 2, failedCount: 0 });
    const msgs = await t.db.select().from(schema.messages);
    expect(msgs).toHaveLength(2);
    expect(msgs.every((m) => m.type === "template" && m.direction === "outbound")).toBe(true);
    expect(msgs.find((m) => m.body?.includes("রহিম"))!.body).toBe("হ্যালো রহিম, অফার: ২০% ছাড়");
    const convs = await t.db.select().from(schema.conversations);
    expect(convs.every((c) => c.status === "closed")).toBe(true); // a broadcast never floods the open inbox
  });

  it("never messages anyone twice, even when processing is run again or concurrently", async () => {
    for (let i = 1; i <= 8; i++) await addContact(`88017110000${String(i).padStart(2, "0")}`, `N${i}`, true);
    const id = await startAndGet();
    const { send, d } = deps({ batchSize: 3 });
    await Promise.all([processBroadcast(t.db, d, id), processBroadcast(t.db, d, id)]);
    await processBroadcast(t.db, d, id);
    const tos = send.mock.calls.map((c) => c[0].to);
    expect(new Set(tos).size).toBe(8);
    expect(tos).toHaveLength(8);
    expect(await bc()).toMatchObject({ status: "completed", sentCount: 8 });
  });

  it("honours an opt-out that happens after the list was frozen", async () => {
    const a = await addContact("8801711000001", "A", true);
    await addContact("8801711000002", "B", true);
    const id = await startAndGet();
    await setOptIn(t.db, a, false, "customer_stop"); // replied STOP before sending started
    const { send, d } = deps();
    const r = await processBroadcast(t.db, d, id);
    expect(r).toMatchObject({ sent: 1, skipped: 1 });
    expect(send.mock.calls.map((c) => c[0].to)).toEqual(["8801711000002"]);
    expect((await recipients()).find((x) => x.contactId === a)).toMatchObject({ status: "skipped", error: expect.stringContaining("সম্মতি") });
  });

  it("does nothing unless the broadcast is 'sending'", async () => {
    await addContact("8801711000001", "A", true);
    const r = (await mk()) as { broadcastId: string };
    const { send, d } = deps();
    expect((await processBroadcast(t.db, d, r.broadcastId)).state).toBe("not_sending"); // still a draft
    expect(send).not.toHaveBeenCalled();
    expect((await processBroadcast(t.db, d, GHOST)).state).toBe("not_sending");
  });

  it("retries transient failures, then marks a recipient failed after 3 attempts; permanent errors fail at once", async () => {
    await addContact("8801711000001", "Flaky", true);
    await addContact("8801711000002", "Dead", true);
    const id = await startAndGet();
    const send = vi.fn().mockImplementation(async (i) => {
      if (i.to === "8801711000001") {
        if (send.mock.calls.filter((c) => c[0].to === i.to).length < 3) throw new WhatsAppSendError("overloaded", 503);
        return { externalId: "wamid.OK" };
      }
      throw new WhatsAppSendError("Recipient not on WhatsApp", 400, 131026);
    });
    await processBroadcast(t.db, { sendTemplate: send, delayMs: 0 }, id);
    const rows = await recipients();
    expect(rows.find((r) => r.toNumber === "8801711000001")).toMatchObject({ status: "sent", attempts: 3 });
    expect(rows.find((r) => r.toNumber === "8801711000002")).toMatchObject({ status: "failed", attempts: 1, error: "Recipient not on WhatsApp" });
    expect(await bc()).toMatchObject({ status: "completed", sentCount: 1, failedCount: 1 });
  });

  it("pauses itself when too many sends fail, instead of burning through the whole list", async () => {
    for (let i = 1; i <= AUTO_PAUSE_MIN_SAMPLE * 3; i++) await addContact(`88017${String(100000 + i)}`, `N${i}`, true);
    const id = await startAndGet();
    const send = vi.fn().mockRejectedValue(new WhatsAppSendError("bad", 400, 131026));
    const r = await processBroadcast(t.db, { sendTemplate: send, delayMs: 0, batchSize: 10 }, id);
    expect(r.state).toBe("paused");
    expect(send.mock.calls.length).toBeLessThan(AUTO_PAUSE_MIN_SAMPLE * 3);
    expect(await bc()).toMatchObject({ status: "paused", pauseReason: expect.stringContaining("ব্যর্থ") });
    expect((await recipients()).filter((x) => x.status === "pending").length).toBeGreaterThan(0); // the rest untouched
  });

  it("pauses immediately on a template/rate-limit error from Meta and keeps the rest pending", async () => {
    for (let i = 1; i <= 5; i++) await addContact(`8801711000${String(100 + i)}`, `N${i}`, true);
    const id = await startAndGet();
    const send = vi.fn().mockRejectedValue(new WhatsAppSendError("Template paused", 400, 132015));
    const r = await processBroadcast(t.db, { sendTemplate: send, delayMs: 0 }, id);
    expect(r.state).toBe("paused");
    expect(send).toHaveBeenCalledTimes(1);
    expect((await bc()).pauseReason).toContain("132015");
    expect((await recipients()).filter((x) => x.status === "pending")).toHaveLength(4);
  });

  it("pauses when the template stops being approved mid-way, and resumes only what is left", async () => {
    for (let i = 1; i <= 4; i++) await addContact(`8801711000${String(200 + i)}`, `N${i}`, true);
    const id = await startAndGet();
    const first = deps({ batchSize: 2, maxMs: 0 });
    await processBroadcast(t.db, first.d, id); // one batch, then stops (time budget)
    expect(first.send).toHaveBeenCalledTimes(2);

    await t.db.update(schema.templates).set({ status: "paused" });
    const second = deps();
    expect(await processBroadcast(t.db, second.d, id)).toMatchObject({ state: "paused", reason: "template_not_approved" });
    expect(second.send).not.toHaveBeenCalled();

    await t.db.update(schema.templates).set({ status: "approved" });
    expect((await startBroadcast(t.db, id, 4)).ok).toBe(true); // resume
    const third = deps();
    expect(await processBroadcast(t.db, third.d, id)).toMatchObject({ state: "completed" });
    expect(third.send).toHaveBeenCalledTimes(2); // only the remaining two, nobody twice
  });

  it("pause stops sending; cancel skips everything unsent", async () => {
    for (let i = 1; i <= 4; i++) await addContact(`8801711000${String(300 + i)}`, `N${i}`, true);
    const id = await startAndGet();
    await processBroadcast(t.db, deps({ batchSize: 2, maxMs: 0 }).d, id);
    expect((await pauseBroadcast(t.db, id)).ok).toBe(true);
    const idle = deps();
    expect((await processBroadcast(t.db, idle.d, id)).state).toBe("paused");
    expect(idle.send).not.toHaveBeenCalled();

    expect((await cancelBroadcast(t.db, id)).ok).toBe(true);
    expect(await bc()).toMatchObject({ status: "cancelled", sentCount: 2, skippedCount: 2 });
    expect((await cancelBroadcast(t.db, id)).ok).toBe(false);
    expect((await pauseBroadcast(t.db, id)).ok).toBe(false);
    expect((await cancelBroadcast(t.db, GHOST)).ok).toBe(false);
  });

  it("releases recipients a crashed worker left claimed", async () => {
    await addContact("8801711000001", "A", true);
    const id = await startAndGet();
    await t.db.update(schema.broadcastRecipients).set({ status: "sending", claimedAt: new Date(Date.now() - 10 * 60_000) });
    const { send, d } = deps();
    expect(await processBroadcast(t.db, d, id)).toMatchObject({ sent: 1, state: "completed" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
