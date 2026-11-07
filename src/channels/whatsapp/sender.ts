import type { SendResult, SendTextInput } from "../types";

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
