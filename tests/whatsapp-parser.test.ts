import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseWhatsAppWebhook } from "@/channels/whatsapp/parser";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures/whatsapp", name), "utf8"));

/** Builds a minimal inbound webhook around one message object. */
const wrap = (message: Record<string, unknown>, contacts: unknown[] = []) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1",
      changes: [
        {
          field: "messages",
          value: { metadata: { phone_number_id: "PNID" }, contacts, messages: [message] },
        },
      ],
    },
  ],
});

describe("parseWhatsAppWebhook", () => {
  it("parses an inbound text message (Meta sample)", () => {
    const { messages, statuses } = parseWhatsAppWebhook(fixture("inbound-text.json"));
    expect(statuses).toEqual([]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelType: "whatsapp",
      channelExternalId: "106540352242922",
      externalId: "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
      contactExternalId: "16505551234",
      contactName: "Sheena Nelson",
      direction: "inbound",
      source: "api",
      type: "text",
      text: "Does it come in another color?",
    });
    expect(messages[0].timestamp.toISOString()).toBe("2025-06-08T20:59:43.000Z");
  });

  it("parses a delivery status (Meta sample)", () => {
    const { messages, statuses } = parseWhatsAppWebhook(fixture("status-delivered.json"));
    expect(messages).toEqual([]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toMatchObject({
      channelExternalId: "106540352242922",
      externalId: "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA",
      status: "delivered",
    });
  });

  it("parses a phone-app echo as an outbound phone_app message to the customer (Meta sample)", () => {
    const { messages } = parseWhatsAppWebhook(fixture("echo-text.json"));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      channelExternalId: "106540352242922",
      contactExternalId: "16505551234", // the customer (`to`), not the business number
      direction: "outbound",
      source: "phone_app",
      type: "text",
    });
  });

  it("extracts captions and button/list reply titles", () => {
    const img = parseWhatsAppWebhook(wrap({ from: "1", id: "a", timestamp: "1", type: "image", image: { id: "m", caption: "দেখুন" } }));
    expect(img.messages[0]).toMatchObject({ type: "image", text: "দেখুন" });

    const btn = parseWhatsAppWebhook(
      wrap({ from: "1", id: "b", timestamp: "1", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "x", title: "মূল্য" } } }),
    );
    expect(btn.messages[0].text).toBe("মূল্য");

    const audio = parseWhatsAppWebhook(wrap({ from: "1", id: "c", timestamp: "1", type: "audio", audio: { id: "m" } }));
    expect(audio.messages[0]).toMatchObject({ type: "audio", text: undefined });
  });

  it("falls back to the business-scoped user id when the phone number is hidden", () => {
    const { messages } = parseWhatsAppWebhook(
      wrap(
        { from_user_id: "BD.123", id: "d", timestamp: "1", type: "text", text: { body: "hi" } },
        [{ profile: { name: "Rahim" }, user_id: "BD.123" }],
      ),
    );
    expect(messages[0]).toMatchObject({ contactExternalId: "BD.123", contactName: "Rahim" });
  });

  it("uses to_user_id for an echo without `to`", () => {
    const { messages } = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "PNID" },
                message_echoes: [{ from: "1", to_user_id: "BD.9", id: "e", timestamp: "1", type: "text", text: { body: "x" } }],
              },
            },
          ],
        },
      ],
    });
    expect(messages[0].contactExternalId).toBe("BD.9");
  });

  it("captures the error of a failed status", () => {
    const { statuses } = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "PNID" },
                statuses: [{ id: "w", status: "failed", timestamp: "1", errors: [{ code: 131047, title: "Re-engagement message" }] }],
              },
            },
          ],
        },
      ],
    });
    expect(statuses[0]).toMatchObject({ status: "failed", error: "131047 Re-engagement message" });
  });

  it("skips reactions and unknown or malformed input without throwing", () => {
    expect(parseWhatsAppWebhook(wrap({ from: "1", id: "r", timestamp: "1", type: "reaction", reaction: { emoji: "👍" } })).messages).toEqual([]);
    for (const bad of [null, undefined, 42, "x", [], {}, { object: "page" }, { object: "whatsapp_business_account", entry: [null, 1, { changes: [{ value: 5 }] }] }]) {
      expect(parseWhatsAppWebhook(bad)).toEqual({ messages: [], statuses: [] });
    }
  });

  it("ignores changes without a phone_number_id", () => {
    const p = wrap({ from: "1", id: "z", timestamp: "1", type: "text", text: { body: "x" } });
    delete (p.entry[0].changes[0].value as Record<string, unknown>).metadata;
    expect(parseWhatsAppWebhook(p).messages).toEqual([]);
  });
});

describe("parseWhatsAppWebhook — Coexistence", () => {
  it("parses a history chunk: phase, order, progress, threads, direction, status", () => {
    const { messages, statuses, history } = parseWhatsAppWebhook(fixture("history-chunk.json"));
    expect(messages).toEqual([]); // history never goes through the live-message path
    expect(statuses).toEqual([]);
    expect(history).toHaveLength(1);

    const chunk = history![0];
    expect(chunk).toMatchObject({ channelExternalId: "106540352242922", phase: 0, chunkOrder: 1, progress: 55 });
    expect(chunk.error).toBeUndefined();
    expect(chunk.threads.map((t) => t.contactExternalId)).toEqual(["16505551234", "16505559999"]);

    const [customer1, business1, media] = chunk.threads[0].messages;
    expect(customer1).toMatchObject({ direction: "inbound", source: "history", text: "Hi, is the kit in stock?", status: "read", externalId: "wamid.HIST.CUSTOMER.1" });
    expect(business1).toMatchObject({ direction: "outbound", source: "history", status: "delivered" });
    expect(media).toMatchObject({ type: "media_placeholder", direction: "inbound", text: undefined });
    expect(chunk.threads[1].messages[0]).toMatchObject({ direction: "outbound", status: "failed" }); // history "error"
    expect(customer1.timestamp.toISOString()).toBe("2025-06-08T16:26:40.000Z");
  });

  it("reports a declined history sync (error 2593109) with no messages", () => {
    const { history } = parseWhatsAppWebhook(fixture("history-declined.json"));
    expect(history).toHaveLength(1);
    expect(history![0].threads).toEqual([]);
    expect(history![0].error).toMatchObject({ code: 2593109, declined: true });
  });

  it("flags other history errors as not declined", () => {
    const { history } = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "history", value: { metadata: { phone_number_id: "P" }, history: [{ errors: [{ code: 1, message: "boom" }] }] } }] }],
    });
    expect(history![0].error).toEqual({ code: 1, message: "boom", declined: false });
  });

  it("parses contact add/remove from smb_app_state_sync", () => {
    const { contactSync, messages } = parseWhatsAppWebhook(fixture("state-sync-contacts.json"));
    expect(messages).toEqual([]);
    expect(contactSync).toHaveLength(2);
    expect(contactSync![0]).toMatchObject({ action: "add", contactExternalId: "16505551234", fullName: "Sheena Nelson", firstName: "Sheena", channelExternalId: "106540352242922" });
    expect(contactSync![1]).toMatchObject({ action: "remove", contactExternalId: "16505559999", fullName: undefined });
  });

  it("ignores unknown state_sync types/actions and malformed history without throwing", () => {
    const wrapField = (field: string, value: unknown) => ({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field, value: { metadata: { phone_number_id: "P" }, ...(value as object) } }] }],
    });
    const odd = parseWhatsAppWebhook(wrapField("smb_app_state_sync", { state_sync: [{ type: "setting" }, { type: "contact", action: "edit", contact: { phone_number: "1" } }, { type: "contact", action: "add", contact: {} }, null, 5] }));
    expect(odd.contactSync).toBeUndefined();
    const bad = parseWhatsAppWebhook(wrapField("history", { history: [null, 7, { threads: [null, { messages: [] }, { id: "1", messages: [null, { id: "x" }] }] }] }));
    expect(bad.history![0].threads).toEqual([{ contactExternalId: "1", messages: [] }]);
  });
});
