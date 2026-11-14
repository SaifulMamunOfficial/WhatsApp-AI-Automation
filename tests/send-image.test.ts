import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { MAX_CAPTION, MAX_IMAGE_BYTES, sendImageReply, validateImage, type ImageFile } from "@/core/inbox/send-image";
import { readMedia } from "@/core/media/storage";
import { sendWhatsAppImage } from "@/channels/whatsapp/sender";
import { sendMessengerImage } from "@/channels/messenger/sender";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let dir: string;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "e".repeat(64);
  t = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "crm-img-"));
}, 60_000);
afterAll(async () => {
  await t.close();
  await rm(dir, { recursive: true, force: true });
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const file = (over: Partial<ImageFile> = {}): ImageFile => ({ bytes: JPEG, mimeType: "image/jpeg", fileName: "photo.jpg", ...over });

describe("validateImage", () => {
  it("accepts JPEG and PNG that really are that", () => {
    expect(validateImage(file())).toBeNull();
    expect(validateImage(file({ bytes: PNG, mimeType: "image/png" }))).toBeNull();
  });
  it("rejects other types, empty, too big and mismatched files", () => {
    expect(validateImage(file({ mimeType: "image/gif" }))).not.toBeNull();
    expect(validateImage(file({ mimeType: "application/pdf" }))).not.toBeNull();
    expect(validateImage(file({ bytes: new Uint8Array(0) }))).not.toBeNull();
    expect(validateImage(file({ bytes: new Uint8Array(MAX_IMAGE_BYTES + 1).fill(0xff) }))).not.toBeNull();
    expect(validateImage(file({ bytes: PNG, mimeType: "image/jpeg" }))).not.toBeNull(); // a PNG pretending to be a JPEG
    expect(validateImage(file({ bytes: new TextEncoder().encode("<html>"), mimeType: "image/png" }))).not.toBeNull();
  });
});

let wa: string;
let fb: string;
let user: string;
const NOW = new Date("2026-03-10T08:00:00Z");

beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
  await t.db.delete(schema.users);
  const [w, m] = await t.db
    .insert(schema.channels)
    .values([
      { type: "whatsapp", name: "WA", externalId: "PNID", status: "active", isTest: true, accessTokenEncrypted: encryptSecret("TOKEN-1") },
      { type: "messenger", name: "FB", externalId: "PAGE", status: "active", isTest: true, accessTokenEncrypted: encryptSecret("TOKEN-2") },
    ])
    .returning();
  const [c] = await t.db.insert(schema.contacts).values({ name: "Rahim" }).returning();
  const mk = async (channelId: string, ext: string, lastAt: Date) => {
    const [i] = await t.db.insert(schema.contactIdentities).values({ contactId: c.id, channelId, externalId: ext }).returning();
    const [cv] = await t.db.insert(schema.conversations).values({ channelId, contactId: c.id, identityId: i.id, lastCustomerMessageAt: lastAt, needsHuman: true }).returning();
    return cv.id;
  };
  wa = await mk(w.id, "8801711000001", new Date(NOW.getTime() - 3600_000));
  fb = await mk(m.id, "PSID1", new Date(NOW.getTime() - 3600_000));
  [{ id: user }] = await t.db.insert(schema.users).values({ email: "a@x.org", name: "A", passwordHash: "x", role: "agent" }).returning({ id: schema.users.id });
});

type ImgSend = (input: unknown) => Promise<{ externalId: string }>;
const deps = (sendImage: ImgSend) => ({ adapterFor: () => ({ sendText: vi.fn(), sendImage: sendImage as never }), now: () => NOW, dir });
const okSend = () => vi.fn<ImgSend>(async () => ({ externalId: `img-${Math.random()}` }));

describe("sendImageReply", () => {
  it("uploads and sends, keeps our own copy, records the message and hands over to the human", async () => {
    const send = okSend();
    const r = await sendImageReply(t.db, deps(send), { conversationId: wa, userId: user, file: file(), caption: "  ফর্মটা দেখুন  " });
    expect(r.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ channelExternalId: "PNID", accessToken: "TOKEN-1", to: "8801711000001", mimeType: "image/jpeg", fileName: "photo.jpg", caption: "ফর্মটা দেখুন", humanAgent: false });

    const [m] = await t.db.select().from(schema.messages);
    expect(m).toMatchObject({ type: "image", direction: "outbound", source: "api", status: "sent", sentByUserId: user, body: "ফর্মটা দেখুন" });
    expect(m.externalId).toMatch(/^img-/);
    const [media] = await t.db.select().from(schema.messageMedia);
    expect(media).toMatchObject({ messageId: m.id, status: "ready", mimeType: "image/jpeg", fileName: "photo.jpg", sizeBytes: JPEG.byteLength });
    expect(Buffer.from((await readMedia(media.storageKey!, dir))!)).toEqual(Buffer.from(JPEG));
    expect(await readdir(dir)).toContain(media.storageKey);
    const [c] = await t.db.select().from(schema.conversations).where(eq(schema.conversations.id, wa));
    expect(c).toMatchObject({ botPaused: true, needsHuman: false, lastMessagePreview: "ফর্মটা দেখুন" });
  });

  it("Messenger: no caption on the picture (it is sent as a separate text by the caller)", async () => {
    const send = okSend();
    expect((await sendImageReply(t.db, deps(send), { conversationId: fb, userId: user, file: file({ bytes: PNG, mimeType: "image/png", fileName: "a.png" }), caption: "hello" })).ok).toBe(true);
    expect(send.mock.calls[0][0]).toMatchObject({ channelExternalId: "PAGE", to: "PSID1", mimeType: "image/png", caption: undefined });
    expect((await t.db.select().from(schema.messages))[0].body).toBeNull();
  });

  it("refuses bad files and over-long captions before sending anything", async () => {
    const send = okSend();
    expect((await sendImageReply(t.db, deps(send), { conversationId: wa, userId: user, file: file({ mimeType: "image/gif" }) })).ok).toBe(false);
    expect((await sendImageReply(t.db, deps(send), { conversationId: wa, userId: user, file: file(), caption: "x".repeat(MAX_CAPTION + 1) })).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await t.db.select().from(schema.messages)).toHaveLength(0);
  });

  it("follows the channel's reply window: WhatsApp after 24h is closed, Messenger uses HUMAN_AGENT up to 7 days", async () => {
    await t.db.update(schema.conversations).set({ lastCustomerMessageAt: new Date(NOW.getTime() - 30 * 3600_000) });
    const send = okSend();
    const blocked = await sendImageReply(t.db, deps(send), { conversationId: wa, userId: user, file: file() });
    expect(blocked.ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect((await sendImageReply(t.db, deps(send), { conversationId: fb, userId: user, file: file() })).ok).toBe(true);
    expect(send.mock.calls[0][0]).toMatchObject({ humanAgent: true });
  });

  it("marks the message failed with Meta's reason and never stores the token", async () => {
    const send = vi.fn<ImgSend>(async () => {
      throw new Error("Media upload failed");
    });
    const r = await sendImageReply(t.db, deps(send), { conversationId: wa, userId: user, file: file() });
    expect(r).toEqual({ ok: false, error: "Media upload failed" });
    const [m] = await t.db.select().from(schema.messages);
    expect(m).toMatchObject({ status: "failed", error: "Media upload failed" });
    expect(JSON.stringify(m)).not.toContain("TOKEN-1");
    expect((await t.db.select().from(schema.conversations).where(eq(schema.conversations.id, wa)))[0].needsHuman).toBe(true);
  });

  it("keeps the echo row when Messenger echoes the message before we finish", async () => {
    // the echo already exists under the id the Send API will return
    const [ch] = await t.db.select().from(schema.channels).where(eq(schema.channels.type, "messenger"));
    await t.db.insert(schema.messages).values({ conversationId: fb, channelId: ch.id, externalId: "mid.ECHO", direction: "outbound", source: "page_inbox", type: "image", status: "sent", sentAt: NOW });
    const send = vi.fn<ImgSend>(async () => ({ externalId: "mid.ECHO" }));
    expect((await sendImageReply(t.db, deps(send), { conversationId: fb, userId: user, file: file() })).ok).toBe(true);
    const all = await t.db.select().from(schema.messages);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ externalId: "mid.ECHO", sentByUserId: user, status: "sent" });
  });

  it("a channel without image support and an unknown conversation are refused", async () => {
    const noImage = { adapterFor: () => ({ sendText: vi.fn() }), now: () => NOW, dir };
    expect((await sendImageReply(t.db, noImage, { conversationId: wa, userId: user, file: file() })).ok).toBe(false);
    expect((await sendImageReply(t.db, deps(okSend()), { conversationId: "00000000-0000-0000-0000-000000000000", userId: user, file: file() })).ok).toBe(false);
  });
});

// ---- the two provider senders ------------------------------------------------------------------

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const baseInput = { channelExternalId: "PNID", accessToken: "TOK", to: "8801711000001", bytes: JPEG, mimeType: "image/jpeg" as const, fileName: "p.jpg" };

describe("sendWhatsAppImage", () => {
  it("uploads the file, then sends an image message pointing at the media id", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return String(url).endsWith("/media") ? json({ id: "MEDIA9" }) : json({ messages: [{ id: "wamid.IMG" }] });
    });
    const r = await sendWhatsAppImage({ ...baseInput, caption: "hi" }, { fetchImpl: fetchImpl as unknown as typeof fetch, graphVersion: "v99.0" });
    expect(r).toEqual({ externalId: "wamid.IMG" });
    expect(calls[0].url).toBe("https://graph.facebook.com/v99.0/PNID/media");
    const form = calls[0].init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("image/jpeg");
    expect((form.get("file") as File).name).toBe("p.jpg");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
    expect(calls[1].url).toBe("https://graph.facebook.com/v99.0/PNID/messages");
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ messaging_product: "whatsapp", recipient_type: "individual", to: "8801711000001", type: "image", image: { id: "MEDIA9", caption: "hi" } });
    expect(calls.map((c) => c.url).join()).not.toContain("TOK"); // the token is only in a header
  });

  it("reports an upload or send failure with Meta's message", async () => {
    const f1 = vi.fn(async () => json({ error: { message: "Unsupported file", code: 131053 } }, 400));
    await expect(sendWhatsAppImage(baseInput, { fetchImpl: f1 as unknown as typeof fetch })).rejects.toThrow("Unsupported file");
    const f2 = vi.fn(async (url: string | URL | Request) => (String(url).endsWith("/media") ? json({ id: "M" }) : json({ error: { message: "Re-engagement message" } }, 400)));
    await expect(sendWhatsAppImage(baseInput, { fetchImpl: f2 as unknown as typeof fetch })).rejects.toThrow("Re-engagement message");
    const f3 = vi.fn(async () => json({}));
    await expect(sendWhatsAppImage(baseInput, { fetchImpl: f3 as unknown as typeof fetch })).rejects.toThrow(/no id/);
  });
});

describe("sendMessengerImage", () => {
  it("posts a multipart attachment as the Page, with the HUMAN_AGENT tag only when asked", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return json({ recipient_id: "PSID1", message_id: "mid.IMG" });
    });
    const f = fetchImpl as unknown as typeof fetch;
    expect(await sendMessengerImage({ ...baseInput, channelExternalId: "PAGE", to: "PSID1" }, { fetchImpl: f })).toEqual({ externalId: "mid.IMG" });
    const form = calls[0].init.body as FormData;
    expect(calls[0].url).toContain("/PAGE/messages");
    expect(JSON.parse(String(form.get("recipient")))).toEqual({ id: "PSID1" });
    expect(JSON.parse(String(form.get("message")))).toEqual({ attachment: { type: "image", payload: { is_reusable: true } } });
    expect(form.get("messaging_type")).toBe("RESPONSE");
    expect(form.get("tag")).toBeNull();
    expect((calls[0].init.headers as Record<string, string>)["Content-Type"]).toBeUndefined(); // multipart boundary is set by fetch
    await sendMessengerImage({ ...baseInput, channelExternalId: "PAGE", to: "PSID1", humanAgent: true }, { fetchImpl: f });
    const tagged = calls[1].init.body as FormData;
    expect(tagged.get("messaging_type")).toBe("MESSAGE_TAG");
    expect(tagged.get("tag")).toBe("HUMAN_AGENT");
  });

  it("reports Meta's error and a missing message id", async () => {
    const f1 = vi.fn(async () => json({ error: { message: "Outside the window", code: 10 } }, 400));
    await expect(sendMessengerImage(baseInput, { fetchImpl: f1 as unknown as typeof fetch })).rejects.toThrow("Outside the window");
    const f2 = vi.fn(async () => json({}));
    await expect(sendMessengerImage(baseInput, { fetchImpl: f2 as unknown as typeof fetch })).rejects.toThrow(/no message_id/);
  });
});

describe("Messenger caption", () => {
  it("is handed back to the caller to send as a separate text (WhatsApp keeps it under the picture)", async () => {
    const mk = () => vi.fn<ImgSend>(async () => ({ externalId: `i-${Math.random()}` }));
    const r1 = await sendImageReply(t.db, deps(mk()), { conversationId: fb, userId: user, file: file(), caption: "ফর্মটা দেখুন" });
    expect(r1).toMatchObject({ ok: true, captionAsText: "ফর্মটা দেখুন" });
    const r2 = await sendImageReply(t.db, deps(mk()), { conversationId: wa, userId: user, file: file(), caption: "ফর্মটা দেখুন" });
    expect(r2).toMatchObject({ ok: true, captionAsText: null });
    const r3 = await sendImageReply(t.db, deps(mk()), { conversationId: fb, userId: user, file: file() });
    expect(r3).toMatchObject({ ok: true, captionAsText: null });
  });
});
