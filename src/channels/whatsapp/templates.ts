import { MetaApiError, type CoexistenceApiOptions } from "./coexistence";
import { WhatsAppSendError } from "./sender";

// WhatsApp message templates: list/create (management API) and send (Cloud API).
// Sources: Meta docs for the create body, positional {{n}} parameters and the send payload.
// NOT verified against the docs: the list endpoint's paging/fields and error codes
// (docs/PLAN.md lists this); everything is parsed defensively.

export type TemplateApiOptions = CoexistenceApiOptions;

export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
}

const base = (o: TemplateApiOptions) =>
  `https://graph.facebook.com/${o.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0"}`;
const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

async function call<T>(url: string, init: RequestInit, o: TemplateApiOptions, describe: string): Promise<T> {
  const res = await (o.fetchImpl ?? fetch)(url, init);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const body = (json ?? {}) as { error?: { message?: string; code?: number } };
  if (!res.ok) throw new MetaApiError(body.error?.message ?? `${describe} failed with HTTP ${res.status}`, res.status, body.error?.code);
  return body as T;
}

/** Lists all templates of a WABA (follows paging, capped so a bad response cannot loop forever). */
export async function listTemplates(wabaId: string, token: string, o: TemplateApiOptions = {}): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let url: string | undefined = `${base(o)}/${encodeURIComponent(wabaId)}/message_templates?fields=id,name,language,status,category,components&limit=100`;
  for (let page = 0; url && page < 20; page++) {
    const r: { data?: Record<string, unknown>[]; paging?: { next?: string } } = await call(url, { method: "GET", headers: bearer(token) }, o, "Template listing");
    for (const t of r.data ?? []) {
      if (typeof t.id !== "string" || typeof t.name !== "string") continue;
      out.push({
        id: t.id,
        name: t.name,
        language: typeof t.language === "string" ? t.language : "",
        status: typeof t.status === "string" ? t.status : "",
        category: typeof t.category === "string" ? t.category : "",
        components: Array.isArray(t.components) ? t.components : [],
      });
    }
    url = r.paging?.next;
  }
  return out;
}

export const TEMPLATE_NAME = /^[a-z0-9_]{1,512}$/;

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: "marketing" | "utility";
  bodyText: string;
  /** One example per {{n}}, in order (Meta requires them). */
  examples: string[];
}

/** Highest {{n}} used in a template text (0 when there are no variables). */
export function placeholderCount(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) max = Math.max(max, Number(m[1]));
  return max;
}

export async function createTemplate(
  wabaId: string,
  token: string,
  input: CreateTemplateInput,
  o: TemplateApiOptions = {},
): Promise<{ id: string; status: string }> {
  if (!TEMPLATE_NAME.test(input.name)) throw new MetaApiError("টেমপ্লেটের নাম ছোট হাতের ইংরেজি অক্ষর, সংখ্যা ও _ দিয়ে হতে হবে।", 400);
  const n = placeholderCount(input.bodyText);
  if (input.examples.length !== n) throw new MetaApiError(`টেমপ্লেটে ${n}টি {{ }} আছে, নমুনা মান দিতে হবে ঠিক ${n}টি।`, 400);

  const body = {
    name: input.name,
    language: input.language,
    category: input.category,
    parameter_format: "positional",
    components: [
      { type: "body", text: input.bodyText, ...(n > 0 ? { example: { body_text: [input.examples] } } : {}) },
    ],
  };
  const r = await call<{ id?: string; status?: string }>(
    `${base(o)}/${encodeURIComponent(wabaId)}/message_templates`,
    { method: "POST", headers: { ...bearer(token), "Content-Type": "application/json" }, body: JSON.stringify(body) },
    o,
    "Template creation",
  );
  if (!r.id) throw new MetaApiError("Template creation returned no id", 200);
  return { id: r.id, status: r.status ?? "PENDING" };
}

export interface SendTemplateInput {
  channelExternalId: string;
  accessToken: string;
  to: string;
  name: string;
  language: string;
  /** Values for {{1}}, {{2}}, ... in order. */
  bodyParams: string[];
}

/** Sends an approved template (the only message type allowed outside the 24h window). */
export async function sendWhatsAppTemplate(input: SendTemplateInput, o: TemplateApiOptions = {}): Promise<{ externalId: string }> {
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    template: {
      name: input.name,
      language: { code: input.language },
      ...(input.bodyParams.length
        ? { components: [{ type: "body", parameters: input.bodyParams.map((text) => ({ type: "text", text })) }] }
        : {}),
    },
  };
  const res = await (o.fetchImpl ?? fetch)(`${base(o)}/${encodeURIComponent(input.channelExternalId)}/messages`, {
    method: "POST",
    headers: { ...bearer(input.accessToken), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const body = (json ?? {}) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) throw new WhatsAppSendError(body.error?.message ?? `Template send failed with HTTP ${res.status}`, res.status, body.error?.code);
  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppSendError("Template send response had no message id", res.status);
  return { externalId: id };
}

/** The BODY text of a template's components, or "". */
export function templateBodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  for (const c of components) {
    if (c && typeof c === "object" && (c as { type?: string }).type?.toUpperCase() === "BODY") {
      const t = (c as { text?: unknown }).text;
      return typeof t === "string" ? t : "";
    }
  }
  return "";
}

/** Fills {{n}} with values (missing ones become empty). */
export function renderTemplate(text: string, params: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => params[Number(n) - 1] ?? "");
}

export type LocalTemplateStatus = "draft" | "pending" | "approved" | "rejected" | "paused";

/** Meta status -> our enum. Disabled/unknown never count as sendable. */
export function mapMetaStatus(status: string): LocalTemplateStatus {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "PENDING":
    case "IN_APPEAL":
    case "PENDING_DELETION":
      return "pending";
    case "PAUSED":
      return "paused";
    case "REJECTED":
    case "DISABLED":
    case "DELETED":
    case "LIMIT_EXCEEDED":
      return "rejected";
    default:
      return "pending";
  }
}
