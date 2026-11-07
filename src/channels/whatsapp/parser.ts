import type { DeliveryStatus, NormalizedMessage, StatusUpdate, WebhookEvents } from "../types";

// Parses WhatsApp Cloud API webhooks (object: whatsapp_business_account).
// Defensive by design: unknown shapes are skipped, never thrown on, so a new Meta
// field can never make the webhook endpoint fail.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function toDate(ts: unknown): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

/** Text to show for a message: body, caption, or the title of a button/list reply. */
function extractText(msg: Obj): string | undefined {
  const type = str(msg.type);
  if (!type) return undefined;
  const content = msg[type];
  if (!isObj(content)) return undefined;

  switch (type) {
    case "text":
      return str(content.body);
    case "image":
    case "video":
    case "document":
      return str(content.caption);
    case "button":
      return str(content.text);
    case "interactive": {
      const reply = isObj(content.button_reply) ? content.button_reply : content.list_reply;
      return isObj(reply) ? str(reply.title) : undefined;
    }
    default:
      return undefined;
  }
}

const STATUSES: ReadonlySet<string> = new Set(["sent", "delivered", "read", "failed"]);

export function parseWhatsAppWebhook(payload: unknown): WebhookEvents {
  const out: WebhookEvents = { messages: [], statuses: [] };
  if (!isObj(payload) || payload.object !== "whatsapp_business_account") return out;

  for (const entry of arr(payload.entry)) {
    if (!isObj(entry)) continue;
    for (const change of arr(entry.changes)) {
      if (!isObj(change) || !isObj(change.value)) continue;
      const value = change.value;
      const field = str(change.field);
      const channelExternalId = isObj(value.metadata) ? str(value.metadata.phone_number_id) : undefined;
      if (!channelExternalId) continue;

      if (field === "messages") {
        parseInbound(value, channelExternalId, out);
        parseStatuses(value, channelExternalId, out);
      } else if (field === "smb_message_echoes") {
        parseEchoes(value, channelExternalId, out);
      }
      // smb_app_state_sync and history are handled in step 7 (Coexistence).
    }
  }
  return out;
}

function parseInbound(value: Obj, channelExternalId: string, out: WebhookEvents) {
  // Map both phone number (wa_id) and BSUID (user_id) to the profile name.
  const names = new Map<string, string>();
  for (const c of arr(value.contacts)) {
    if (!isObj(c)) continue;
    const name = isObj(c.profile) ? str(c.profile.name) : undefined;
    if (!name) continue;
    for (const key of [str(c.wa_id), str(c.user_id)]) if (key) names.set(key, name);
  }

  for (const m of arr(value.messages)) {
    if (!isObj(m)) continue;
    const id = str(m.id);
    // Phone number when available; business-scoped user id when the user hides their number.
    const from = str(m.from) ?? str(m.from_user_id);
    const type = str(m.type);
    if (!id || !from || !type) continue;
    if (type === "reaction") continue; // reactions are not messages in the inbox

    const message: NormalizedMessage = {
      channelType: "whatsapp",
      channelExternalId,
      externalId: id,
      contactExternalId: from,
      contactName: names.get(from) ?? (str(m.from_user_id) ? names.get(str(m.from_user_id)!) : undefined),
      direction: "inbound",
      source: "api",
      type,
      text: extractText(m),
      timestamp: toDate(m.timestamp),
      raw: m,
    };
    out.messages.push(message);
  }
}

function parseStatuses(value: Obj, channelExternalId: string, out: WebhookEvents) {
  for (const s of arr(value.statuses)) {
    if (!isObj(s)) continue;
    const id = str(s.id);
    const status = str(s.status);
    if (!id || !status || !STATUSES.has(status)) continue;

    let error: string | undefined;
    const firstError = arr(s.errors).find(isObj);
    if (firstError) {
      const code = firstError.code !== undefined ? String(firstError.code) : "";
      error = [code, str(firstError.title) ?? str(firstError.message)].filter(Boolean).join(" ");
    }

    const update: StatusUpdate = {
      channelType: "whatsapp",
      channelExternalId,
      externalId: id,
      status: status as DeliveryStatus,
      timestamp: toDate(s.timestamp),
      error,
    };
    out.statuses.push(update);
  }
}

// Messages sent from the WhatsApp Business App on the phone (Coexistence).
function parseEchoes(value: Obj, channelExternalId: string, out: WebhookEvents) {
  for (const m of arr(value.message_echoes)) {
    if (!isObj(m)) continue;
    const id = str(m.id);
    // `to` can be missing; fall back to the business-scoped id.
    const to = str(m.to) ?? str(m.to_user_id);
    const type = str(m.type);
    if (!id || !to || !type) continue;

    out.messages.push({
      channelType: "whatsapp",
      channelExternalId,
      externalId: id,
      contactExternalId: to,
      direction: "outbound",
      source: "phone_app",
      type,
      text: extractText(m),
      timestamp: toDate(m.timestamp),
      raw: m,
    });
  }
}
