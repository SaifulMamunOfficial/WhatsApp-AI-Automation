import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ingestEvents } from "@/core/inbox/ingest";
import { downloadMedia, isSafeDownloadUrl, looksLike } from "@/core/media/download";
import { isStorageKey, MAX_MEDIA_BYTES, readMedia, saveMedia } from "@/core/media/storage";
import { baseMime, kindOf, serveHeaders } from "@/core/media/types";
import { encryptSecret } from "@/lib/crypto";
import { parseWhatsAppWebhook } from "@/channels/whatsapp/parser";
import { parseMessengerWebhook } from "@/channels/messenger/parser";
import { createTestDb } from "./helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
let dir: string;
beforeAll(async () => {
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  t = await createTestDb();
  dir = await mkdtemp(join(tmpdir(), "crm-media-"));
}, 60_000);
afterAll(async () => {
  await t.close();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  await t.db.delete(schema.contacts);
  await t.db.delete(schema.channels);
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("mime rules", () => {
  it("allows photos, voice notes, video and documents but not SVG/HTML/scripts", () => {
    expect(kindOf("image/jpeg")?.group).toBe("image");
    expect(kindOf("audio/ogg; codecs=opus")?.group).toBe("audio");
    expect(kindOf("application/pdf")?.group).toBe("file");
    for (const bad of ["image/svg+xml", "text/html", "application/javascript", "application/x-msdownload", "", null, undefined]) expect(kindOf(bad)).toBeNull();
    expect(baseMime("Audio/OGG; codecs=opus")).toBe("audio/ogg");
  });

  it("serves images inline, documents as downloads, never sniffable", () => {
    const img = serveHeaders("image/png", null, 10);
    expect(img["Content-Disposition"]).toMatch(/^inline/);
    expect(img["X-Content-Type-Options"]).toBe("nosniff");
    expect(img["Content-Security-Policy"]).toContain("sandbox");
    expect(serveHeaders("application/pdf", 'a"b\r\nx.pdf', 10)["Content-Disposition"]).toBe('attachment; filename="a_b_x.pdf"');
  });

  it("checks file signatures for images and PDF", () => {
    expect(looksLike("image/jpeg", JPEG)).toBe(true);
    expect(looksLike("image/jpeg", png())).toBe(false);
    expect(looksLike("application/pdf", new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(looksLike("application/pdf", new TextEncoder().encode("<html>"))).toBe(false);
    expect(looksLike("audio/ogg", new Uint8Array([1, 2, 3]))).toBe(true); // no signature rule: allowed
  });
});

describe("download URL safety", () => {
  it("accepts https links to real hostnames only", () => {
    expect(isSafeDownloadUrl("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
    for (const bad of ["http://x.com/a", "https://127.0.0.1/a", "https://localhost/a", "https://10.0.0.5/a", "https://[::1]/a", "https://db.internal/a", "https://u:p@x.com/a", "file:///etc/passwd", "not a url"]) {
      expect(isSafeDownloadUrl(bad)).toBe(false);
    }
  });
});

describe("storage", () => {
  it("saves under a random key and reads it back", async () => {
    const key = await saveMedia(JPEG, "JPG", dir);
    expect(isStorageKey(key)).toBe(true);
    expect(await readdir(dir)).toContain(key);
    expect(Buffer.from((await readMedia(key, dir))!)).toEqual(Buffer.from(JPEG));
  });
  it("never reads outside the folder", async () => {
    for (const key of ["../secret.txt", "..\\x.jpg", "abc.jpg", `${"a".repeat(32)}/../x.jpg`, `${"g".repeat(32)}.jpg`]) {
      expect(isStorageKey(key)).toBe(false);
      expect(await readMedia(key, dir)).toBeNull();
    }
  });
});

describe("parsers keep the file reference", () => {
  const waPayload = (msg: object) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, contacts: [{ wa_id: "8801711000001", profile: { name: "Rahim" } }], messages: [msg] } }] }],
  });
  it("WhatsApp image, voice note and document", () => {
    const img = parseWhatsAppWebhook(waPayload({ id: "w1", from: "8801711000001", type: "image", timestamp: "1700000000", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "দেখুন" } })).messages[0];
    expect(img.media).toEqual({ kind: "whatsapp_id", ref: "MEDIA1", mimeType: "image/jpeg", fileName: undefined });
    expect(img.text).toBe("দেখুন");
    const voice = parseWhatsAppWebhook(waPayload({ id: "w2", from: "8801711000001", type: "audio", timestamp: "1700000000", audio: { id: "MEDIA2", mime_type: "audio/ogg; codecs=opus", voice: true } })).messages[0];
    expect(voice.media?.ref).toBe("MEDIA2");
    const doc = parseWhatsAppWebhook(waPayload({ id: "w3", from: "8801711000001", type: "document", timestamp: "1700000000", document: { id: "MEDIA3", mime_type: "application/pdf", filename: "form.pdf" } })).messages[0];
    expect(doc.media?.fileName).toBe("form.pdf");
    expect(parseWhatsAppWebhook(waPayload({ id: "w4", from: "8801711000001", type: "text", timestamp: "1700000000", text: { body: "hi" } })).messages[0].media).toBeUndefined();
  });
  it("Messenger attachment link", () => {
    const payload = { object: "page", entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1700000000000, message: { mid: "m1", attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/v/a.jpg" } }] } }] }] };
    const m = parseMessengerWebhook(payload).messages[0];
    expect(m.media).toEqual({ kind: "url", ref: "https://scontent.xx.fbcdn.net/v/a.jpg" });
    expect(m.type).toBe("image");
  });
});

async function seedWhatsAppImage() {
  await t.db.insert(schema.channels).values({ type: "whatsapp", name: "WA", externalId: "P1", isTest: true, status: "active", accessTokenEncrypted: encryptSecret("TOKEN-123") });
  const events = parseWhatsAppWebhook({
    object: "whatsapp_business_account",
    entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, contacts: [{ wa_id: "8801711000001", profile: { name: "Rahim" } }], messages: [{ id: "w1", from: "8801711000001", type: "image", timestamp: "1700000000", image: { id: "MEDIA1", mime_type: "image/jpeg" } }] } }] }],
  });
  const res = await ingestEvents(t.db, events);
  return res;
}

const res = (body: Uint8Array | string, init: ResponseInit = {}) => new Response(body as BodyInit, init);

describe("ingest + download (WhatsApp)", () => {
  it("stores a pending media row on ingest and none for a redelivery", async () => {
    const r = await seedWhatsAppImage();
    expect(r.newMedia).toHaveLength(1);
    const [row] = await t.db.select().from(schema.messageMedia);
    expect(row).toMatchObject({ refKind: "whatsapp_id", ref: "MEDIA1", status: "pending" });
    const again = await ingestEvents(t.db, parseWhatsAppWebhook({ object: "whatsapp_business_account", entry: [{ id: "W", changes: [{ field: "messages", value: { metadata: { phone_number_id: "P1" }, messages: [{ id: "w1", from: "8801711000001", type: "image", timestamp: "1700000000", image: { id: "MEDIA1" } }] } }] }] }));
    expect(again.newMedia).toHaveLength(0);
    expect(await t.db.select().from(schema.messageMedia)).toHaveLength(1);
  });

  it("looks up the media, downloads with the token and stores the file", async () => {
    const r = await seedWhatsAppImage();
    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
      calls.push({ url: u, auth });
      if (u.includes("graph.facebook.com")) return res(JSON.stringify({ url: "https://lookaside.fbsbx.com/wa/1", mime_type: "image/jpeg" }));
      return res(JPEG, { headers: { "content-type": "image/jpeg" } });
    });
    expect(await downloadMedia(t.db, r.newMedia[0], { fetchImpl: fetchImpl as unknown as typeof fetch, dir })).toBe("ready");
    const [row] = await t.db.select().from(schema.messageMedia);
    expect(row).toMatchObject({ status: "ready", mimeType: "image/jpeg", sizeBytes: JPEG.byteLength, error: null });
    expect(Buffer.from((await readMedia(row.storageKey!, dir))!)).toEqual(Buffer.from(JPEG));
    expect(calls[0].auth).toBe("Bearer TOKEN-123");
    expect(calls[1].auth).toBe("Bearer TOKEN-123");
    expect(JSON.stringify(row)).not.toContain("TOKEN-123");
    // already done: a second run does nothing
    expect(await downloadMedia(t.db, r.newMedia[0], { fetchImpl: fetchImpl as unknown as typeof fetch, dir })).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  const failWith = async (impl: (u: string) => Response | Promise<Response>) => {
    const r = await seedWhatsAppImage();
    const fetchImpl = vi.fn(async (url: string | URL | Request) => impl(String(url)));
    const out = await downloadMedia(t.db, r.newMedia[0], { fetchImpl: fetchImpl as unknown as typeof fetch, dir });
    const [row] = await t.db.select().from(schema.messageMedia);
    return { out, row, id: r.newMedia[0] };
  };
  const lookup = (url: string) => res(JSON.stringify({ url, mime_type: "image/jpeg" }));

  it("fails (and can be retried) when Meta refuses", async () => {
    const { out, row, id } = await failWith(() => res("{}", { status: 400 }));
    expect(out).toBe("failed");
    expect(row.status).toBe("failed");
    expect(row.error).toContain("HTTP 400");
    expect(row.attempts).toBe(1);
    const retry = await downloadMedia(t.db, id, { fetchImpl: (async (u: string) => (u.includes("graph") ? lookup("https://cdn.example.com/x") : res(JPEG, { headers: { "content-type": "image/jpeg" } }))) as unknown as typeof fetch, dir });
    expect(retry).toBe("ready");
    expect((await t.db.select().from(schema.messageMedia).where(eq(schema.messageMedia.id, id)))[0].attempts).toBe(2);
  });

  it("refuses a file type we do not store", async () => {
    const { row } = await failWith((u) => (u.includes("graph") ? lookup("https://cdn.example.com/x") : res("<svg/>", { headers: { "content-type": "image/svg+xml" } })));
    expect(row.status).toBe("failed");
    expect(row.storageKey).toBeNull();
  });

  it("refuses a file whose bytes do not match the claimed type", async () => {
    const { row } = await failWith((u) => (u.includes("graph") ? lookup("https://cdn.example.com/x") : res(png(), { headers: { "content-type": "image/jpeg" } })));
    expect(row.status).toBe("failed");
    expect(row.error).toContain("মেলেনি");
  });

  it("refuses an unsafe download link", async () => {
    const { row } = await failWith((u) => (u.includes("graph") ? lookup("http://169.254.169.254/latest") : res(JPEG)));
    expect(row.status).toBe("failed");
  });

  it("refuses a file that declares itself too big", async () => {
    const big = await failWith((u) => (u.includes("graph") ? lookup("https://cdn.example.com/x") : res(JPEG, { headers: { "content-type": "image/jpeg", "content-length": String(MAX_MEDIA_BYTES + 1) } })));
    expect(big.row.status).toBe("failed");
  });

  it("refuses a file that is bigger than it declared (stops reading at the limit)", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(MAX_MEDIA_BYTES));
        c.enqueue(new Uint8Array(10));
        c.close();
      },
    });
    const lying = await failWith((u) => (u.includes("graph") ? lookup("https://cdn.example.com/x") : new Response(stream, { headers: { "content-type": "image/jpeg" } })));
    expect(lying.row.status).toBe("failed");
  });

  it("never stores the token or link in the error", async () => {
    const { row } = await failWith(() => {
      throw new Error("boom TOKEN-123 https://secret.link/x");
    });
    expect(row.error).not.toContain("TOKEN-123");
    expect(row.error).not.toContain("secret.link");
  });
});

describe("download (Messenger link)", () => {
  it("downloads the attachment link without any token", async () => {
    await t.db.insert(schema.channels).values({ type: "messenger", name: "FB", externalId: "PAGE1", isTest: true, status: "active" });
    const r = await ingestEvents(
      t.db,
      parseMessengerWebhook({ object: "page", entry: [{ id: "PAGE1", messaging: [{ sender: { id: "PSID1" }, recipient: { id: "PAGE1" }, timestamp: 1700000000000, message: { mid: "m1", attachments: [{ type: "image", payload: { url: "https://scontent.xx.fbcdn.net/v/a.jpg" } }] } }] }] }),
    );
    const seen: (string | undefined)[] = [];
    const fetchImpl = vi.fn(async (_u: string | URL | Request, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string> | undefined)?.Authorization);
      return res(JPEG, { headers: { "content-type": "image/jpeg" } });
    });
    expect(await downloadMedia(t.db, r.newMedia[0], { fetchImpl: fetchImpl as unknown as typeof fetch, dir })).toBe("ready");
    expect(seen).toEqual([undefined]);
    expect(await readFile(join(dir, (await t.db.select().from(schema.messageMedia))[0].storageKey!))).toBeTruthy();
  });
});
