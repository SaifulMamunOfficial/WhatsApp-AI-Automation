import type { SendImageInput, SendResult, SendTextInput } from "../types";

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
}

export interface WhatsAppSenderOptions {
  graphVersion?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/**
 * Sends a free-form text message via the Cloud API. Only valid inside the 24h
 * customer-service window; outside it a template is required (step 12).
 * The access token is only ever put in the Authorization header, never in errors or logs.
 */
export async function sendWhatsAppText(
  input: SendTextInput,
  opts: WhatsAppSenderOptions = {},
): Promise<SendResult> {
  const version = opts.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0";
  const doFetch = opts.fetchImpl ?? fetch;

  const res = await doFetch(`https://graph.facebook.com/${version}/${encodeURIComponent(input.channelExternalId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "text",
      text: { body: input.text, preview_url: false },
    }),
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const body = (json ?? {}) as {
    messages?: { id?: string }[];
    error?: { message?: string; code?: number };
  };

  if (!res.ok) {
    throw new WhatsAppSendError(
      body.error?.message ?? `WhatsApp send failed with HTTP ${res.status}`,
      res.status,
      body.error?.code,
    );
  }
  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppSendError("WhatsApp response had no message id", res.status);
  return { externalId: id };
}

/**
 * Sends a picture: first uploads the file to Meta (POST /{phone-number-id}/media, multipart), then
 * sends an image message that points at the returned media id. Free-form, so only inside the 24h
 * window like text. NOT yet verified against the live Cloud API (written from Meta's documented shape).
 */
export async function sendWhatsAppImage(input: SendImageInput, opts: WhatsAppSenderOptions = {}): Promise<SendResult> {
  const version = opts.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0";
  const doFetch = opts.fetchImpl ?? fetch;
  const base = `https://graph.facebook.com/${version}/${encodeURIComponent(input.channelExternalId)}`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", input.mimeType);
  form.append("file", new Blob([input.bytes as BlobPart], { type: input.mimeType }), input.fileName);
  const up = await doFetch(`${base}/media`, { method: "POST", headers: { Authorization: `Bearer ${input.accessToken}` }, body: form });
  const upBody = ((await up.json().catch(() => undefined)) ?? {}) as { id?: string; error?: { message?: string; code?: number } };
  if (!up.ok) throw new WhatsAppSendError(upBody.error?.message ?? `WhatsApp media upload failed with HTTP ${up.status}`, up.status, upBody.error?.code);
  if (!upBody.id) throw new WhatsAppSendError("WhatsApp media upload returned no id", up.status);

  const res = await doFetch(`${base}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.to,
      type: "image",
      image: { id: upBody.id, ...(input.caption ? { caption: input.caption } : {}) },
    }),
  });
  const body = ((await res.json().catch(() => undefined)) ?? {}) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok) throw new WhatsAppSendError(body.error?.message ?? `WhatsApp image send failed with HTTP ${res.status}`, res.status, body.error?.code);
  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppSendError("WhatsApp response had no message id", res.status);
  return { externalId: id };
}
