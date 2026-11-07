import type { NormalizedMessage, WebhookEvents } from "../types";

// Parses Facebook Messenger webhooks (object: page). Defensive: unknown shapes are
// skipped, never thrown on.
//
// Subscribed fields: messages, message_echoes, messaging_postbacks. Delivery and read
// receipts are not subscribed (read receipts are watermark-based, not per message).

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const idOf = (v: unknown): string | undefined => (isObj(v) ? str(v.id) : undefined);

/** app_id Meta reports for messages sent from the Page inbox / Meta Business Suite (Graph v12+). */
export const PAGE_INBOX_APP_ID = "26390203743090";

export interface MessengerParseOptions {
  /** Our own Meta App id. Echoes of messages sent through our API carry this app_id. */
  ownAppId?: string;
}

function toDate(ts: unknown): Date {
  const n = Number(ts); // Messenger timestamps are milliseconds
  return Number.isFinite(n) && n > 0 ? new Date(n) : new Date();
}

export function parseMessengerWebhook(payload: unknown, opts: MessengerParseOptions = {}): WebhookEvents {
  const out: WebhookEvents = { messages: [], statuses: [] };
  if (!isObj(payload) || payload.object !== "page") return out;

  for (const entry of arr(payload.entry)) {
    if (!isObj(entry)) continue;
    const entryPageId = str(entry.id);
    for (const event of arr(entry.messaging)) {
      if (!isObj(event)) continue;
      const parsed = parseEvent(event, entryPageId, opts);
      if (parsed) out.messages.push(parsed);
    }
  }
  return out;
}

function parseEvent(event: Obj, entryPageId: string | undefined, opts: MessengerParseOptions): NormalizedMessage | null {
  const senderId = idOf(event.sender);
  const recipientId = idOf(event.recipient);
  if (!senderId || !recipientId) return null;
  const timestamp = toDate(event.timestamp);

  if (isObj(event.message)) {
    const m = event.message;
    const mid = str(m.mid);
    if (!mid || m.is_deleted === true) return null;

    const attachments = arr(m.attachments).filter(isObj);
    const type = attachments.length ? (str(attachments[0].type) ?? "attachment") : "text";
    const text = str(m.text);
    const isEcho = m.is_echo === true;

    if (isEcho) {
      // Echo: sender is the Page, recipient is the customer.
      const appId = m.app_id !== undefined ? String(m.app_id) : undefined;
      const sentByUs = !!opts.ownAppId && appId === opts.ownAppId;
      return {
        channelType: "messenger",
        channelExternalId: senderId,
        externalId: mid,
        contactExternalId: recipientId,
        direction: "outbound",
        // Sent through our own API => not a human reply, must not pause the bot.
        // Anything else (Page inbox, another connected app) counts as a human/other-system reply.
        source: sentByUs ? "api" : "page_inbox",
        type,
        text,
        timestamp,
        raw: m,
      };
    }

    return {
      channelType: "messenger",
      channelExternalId: recipientId || entryPageId || "",
      externalId: mid,
      contactExternalId: senderId,
      direction: "inbound",
      source: "api",
      type,
      text,
      timestamp,
      raw: m,
    };
  }

  if (isObj(event.postback)) {
    const p = event.postback;
    return {
      channelType: "messenger",
      channelExternalId: recipientId,
      // Older payloads have no mid; synthesize a stable id so redeliveries dedupe.
      externalId: str(p.mid) ?? `postback.${senderId}.${String(event.timestamp)}`,
      contactExternalId: senderId,
      direction: "inbound",
      source: "api",
      type: "postback",
      text: str(p.title) ?? str(p.payload),
      timestamp,
      raw: p,
    };
  }

  return null;
}
