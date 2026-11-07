import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PAGE_INBOX_APP_ID, parseMessengerWebhook } from "@/channels/messenger/parser";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures/messenger", name), "utf8"));

const wrapEvent = (event: Record<string, unknown>) => ({
  object: "page",
  entry: [{ id: "PAGE", time: 1, messaging: [event] }],
});

describe("parseMessengerWebhook", () => {
  it("parses an inbound text message", () => {
    const { messages, statuses } = parseMessengerWebhook(fixture("inbound-text.json"));
    expect(statuses).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelType: "messenger",
      channelExternalId: "110000000000001", // the Page (recipient)
      externalId: "mid.1457764197618:41d102a3e1ae206a38",
      contactExternalId: "5550001112223334", // the PSID (sender)
      direction: "inbound",
      source: "api",
      type: "text",
      text: "hello, world!",
    });
    expect(messages[0].timestamp.getTime()).toBe(1458692752478); // milliseconds
  });

  it("parses an attachment message: type from the attachment, no text", () => {
    const { messages } = parseMessengerWebhook(fixture("inbound-attachment.json"));
    expect(messages[0]).toMatchObject({ type: "image", text: undefined, externalId: "mid.attachment:0001" });
  });

  it("treats a Page-inbox echo as outbound page_inbox to the customer", () => {
    const { messages } = parseMessengerWebhook(fixture("echo-page-inbox.json"), { ownAppId: "999" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelExternalId: "110000000000001", // the Page (sender of an echo)
      contactExternalId: "5550001112223334", // the customer (recipient of an echo)
      direction: "outbound",
      source: "page_inbox",
      text: "জি, বলুন।",
    });
  });

  it("marks an echo of a message sent through OUR app as api, so it does not pause the bot", () => {
    const echo = wrapEvent({
      sender: { id: "PAGE" },
      recipient: { id: "PSID" },
      timestamp: 1,
      message: { is_echo: true, app_id: 1517776481860111, mid: "m1", text: "bot reply" },
    });
    const own = parseMessengerWebhook(echo, { ownAppId: "1517776481860111" });
    expect(own.messages[0].source).toBe("api");
    // Another app, or us not knowing our own id: treated as a non-bot reply (safe default).
    expect(parseMessengerWebhook(echo, { ownAppId: "42" }).messages[0].source).toBe("page_inbox");
    expect(parseMessengerWebhook(echo).messages[0].source).toBe("page_inbox");
    expect(PAGE_INBOX_APP_ID).toBe("26390203743090");
  });

  it("parses a postback, synthesizing a stable id when there is no mid", () => {
    const ev = {
      sender: { id: "PSID" },
      recipient: { id: "PAGE" },
      timestamp: 123,
      postback: { title: "মূল্য জানুন", payload: "PRICE" },
    };
    const a = parseMessengerWebhook(wrapEvent(ev)).messages[0];
    const b = parseMessengerWebhook(wrapEvent(ev)).messages[0];
    expect(a).toMatchObject({ type: "postback", text: "মূল্য জানুন", direction: "inbound" });
    expect(a.externalId).toBe(b.externalId); // redelivery dedupes
    expect(a.externalId).toContain("PSID");
  });

  it("skips events without a mid, deleted messages, and unrelated events", () => {
    const base = { sender: { id: "PSID" }, recipient: { id: "PAGE" }, timestamp: 1 };
    expect(parseMessengerWebhook(wrapEvent({ ...base, message: { text: "no mid" } })).messages).toEqual([]);
    expect(parseMessengerWebhook(wrapEvent({ ...base, message: { mid: "m", is_deleted: true } })).messages).toEqual([]);
    expect(parseMessengerWebhook(wrapEvent({ ...base, delivery: { mids: ["m"], watermark: 1 } })).messages).toEqual([]);
    expect(parseMessengerWebhook(wrapEvent({ ...base, read: { watermark: 1 } })).messages).toEqual([]);
    expect(parseMessengerWebhook(wrapEvent({ message: { mid: "m", text: "x" } })).messages).toEqual([]); // no sender/recipient
  });

  it("ignores other objects and malformed input without throwing", () => {
    for (const bad of [null, undefined, 1, "x", [], {}, { object: "instagram", entry: [] }, { object: "page", entry: [null, 5, { messaging: [null, "x"] }] }]) {
      expect(parseMessengerWebhook(bad)).toEqual({ messages: [], statuses: [] });
    }
  });
});
