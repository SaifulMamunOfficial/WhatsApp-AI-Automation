import { MetaApiError, type CoexistenceApiOptions } from "../whatsapp/coexistence";

// Graph API calls for connecting Facebook Pages to the CRM (Messenger channel).
// Flow: Facebook Login (browser) -> user token -> long-lived user token -> pages the person
// manages (each with its own Page token) -> subscribe the app to the Page's webhooks.
// Page tokens derived from a long-lived user token do not expire (Meta's documented
// behaviour for Page tokens; not re-verified here, so the app shows status if sending fails).

export type PageApiOptions = CoexistenceApiOptions;

/** Webhook fields we subscribe each Page to (see docs/META_NOTES.md). */
export const MESSENGER_SUBSCRIBED_FIELDS = ["messages", "message_echoes", "messaging_postbacks"] as const;

export interface ManagedPage {
  id: string;
  name: string;
  /** Page access token. Server-side only: never send to the browser. */
  accessToken: string;
  tasks: string[];
}

const base = (o: PageApiOptions) =>
  `https://graph.facebook.com/${o.graphVersion ?? process.env.META_GRAPH_VERSION ?? "v23.0"}`;

async function call<T>(url: string, init: RequestInit, o: PageApiOptions, describe: string): Promise<T> {
  const res = await (o.fetchImpl ?? fetch)(url, init);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = undefined;
  }
  const body = (json ?? {}) as { error?: { message?: string; code?: number } };
  if (!res.ok) {
    // Never put the URL (may hold the app secret) or any token into the error.
    throw new MetaApiError(body.error?.message ?? `${describe} failed with HTTP ${res.status}`, res.status, body.error?.code);
  }
  return body as T;
}

const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

/** Short-lived user token (from FB.login) -> long-lived user token (about 60 days). */
export async function exchangeForLongLivedUserToken(
  shortToken: string,
  creds: { appId: string; appSecret: string },
  o: PageApiOptions = {},
): Promise<string> {
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: creds.appId,
    client_secret: creds.appSecret,
    fb_exchange_token: shortToken,
  });
  const r = await call<{ access_token?: string }>(`${base(o)}/oauth/access_token?${qs}`, { method: "GET" }, o, "Token exchange");
  if (!r.access_token) throw new MetaApiError("Token exchange returned no access_token", 200);
  return r.access_token;
}

export async function listManagedPages(userToken: string, o: PageApiOptions = {}): Promise<ManagedPage[]> {
  const r = await call<{ data?: { id: string; name?: string; access_token?: string; tasks?: string[] }[] }>(
    `${base(o)}/me/accounts?fields=id,name,access_token,tasks&limit=100`,
    { method: "GET", headers: bearer(userToken) },
    o,
    "Page listing",
  );
  return (r.data ?? [])
    .filter((p) => p.id && p.access_token)
    .map((p) => ({ id: p.id, name: p.name ?? p.id, accessToken: p.access_token!, tasks: p.tasks ?? [] }));
}

/** Subscribes our app to the Page so Messenger webhooks (messages, echoes, postbacks) reach us. */
export async function subscribePage(pageId: string, pageToken: string, o: PageApiOptions = {}): Promise<void> {
  const r = await call<{ success?: boolean }>(
    `${base(o)}/${encodeURIComponent(pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { ...bearer(pageToken), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ subscribed_fields: MESSENGER_SUBSCRIBED_FIELDS.join(",") }),
    },
    o,
    "Page webhook subscription",
  );
  if (r.success === false) throw new MetaApiError("Page webhook subscription was not accepted", 200);
}
