import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { signMetaBody, verifyMetaSignature } from "@/channels/meta-signature";
import { handleDelivery, handleVerification } from "@/channels/webhook-handler";
import { parseWhatsAppWebhook } from "@/channels/whatsapp/parser";
import type { ChannelAdapter } from "@/channels/types";

const SECRET = "test-app-secret";
const body = readFileSync(path.join(__dirname, "fixtures/whatsapp/inbound-text.json"), "utf8");

const adapter: ChannelAdapter = {
  type: "whatsapp",
  verifySignature: (raw, header) => verifyMetaSignature(raw, header, SECRET),
  parseWebhook: parseWhatsAppWebhook,
  sendText: async () => ({ externalId: "x" }),
};

const post = (raw: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body: raw, headers });

describe("handleVerification (GET)", () => {
  const url = (q: string) => new URL(`http://localhost/api/webhooks/whatsapp?${q}`);

  it("echoes the challenge when mode and token are right", async () => {
    const res = handleVerification(url("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=12345"), "tok");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("rejects a wrong token, wrong mode, missing params, or an unset server token", () => {
    expect(handleVerification(url("hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1"), "tok").status).toBe(403);
    expect(handleVerification(url("hub.mode=unsubscribe&hub.verify_token=tok&hub.challenge=1"), "tok").status).toBe(403);
    expect(handleVerification(url("hub.mode=subscribe&hub.challenge=1"), "tok").status).toBe(403);
    expect(handleVerification(url("hub.mode=subscribe&hub.verify_token=&hub.challenge=1"), "").status).toBe(403);
    expect(handleVerification(url("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=1"), undefined).status).toBe(403);
  });
});

describe("handleDelivery (POST)", () => {
  it("stores events and answers 200 for a correctly signed request", async () => {
    const ingest = vi.fn().mockResolvedValue({});
    const res = await handleDelivery(post(body, { "x-hub-signature-256": signMetaBody(body, SECRET) }), { adapter, ingest });
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledOnce();
    expect(ingest.mock.calls[0][0].messages[0].text).toBe("Does it come in another color?");
  });

  it("rejects missing or wrong signatures with 401 and never ingests", async () => {
    const ingest = vi.fn();
    expect((await handleDelivery(post(body), { adapter, ingest })).status).toBe(401);
    expect((await handleDelivery(post(body, { "x-hub-signature-256": signMetaBody(body, "wrong") }), { adapter, ingest })).status).toBe(401);
    expect((await handleDelivery(post(body + " ", { "x-hub-signature-256": signMetaBody(body, SECRET) }), { adapter, ingest })).status).toBe(401);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns 400 for a signed but non-JSON body", async () => {
    const raw = "not json";
    const res = await handleDelivery(post(raw, { "x-hub-signature-256": signMetaBody(raw, SECRET) }), { adapter, ingest: vi.fn() });
    expect(res.status).toBe(400);
  });

  it("acknowledges events we do not handle without ingesting", async () => {
    const raw = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
    const ingest = vi.fn();
    const res = await handleDelivery(post(raw, { "x-hub-signature-256": signMetaBody(raw, SECRET) }), { adapter, ingest });
    expect(res.status).toBe(200);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns 500 when storing fails so Meta retries, and logs it", async () => {
    const log = vi.fn();
    const res = await handleDelivery(post(body, { "x-hub-signature-256": signMetaBody(body, SECRET) }), {
      adapter,
      ingest: vi.fn().mockRejectedValue(new Error("db down")),
      log,
    });
    expect(res.status).toBe(500);
    expect(log).toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const res = await handleDelivery(post("x", { "content-length": "5000000" }), { adapter, ingest: vi.fn() });
    expect(res.status).toBe(413);
  });
});
