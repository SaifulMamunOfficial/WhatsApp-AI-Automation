import * as schema from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import type { Db } from "@/core/inbox/ingest";
import {
  exchangeForLongLivedUserToken,
  listManagedPages,
  subscribePage,
  type ManagedPage,
  type PageApiOptions,
} from "@/channels/messenger/pages";

// Connects a Facebook Page as a Messenger channel. Page tokens never leave the server.

export interface PageApi {
  exchangeForLongLivedUserToken: (shortToken: string) => Promise<string>;
  listManagedPages: (userToken: string) => Promise<ManagedPage[]>;
  subscribePage: (pageId: string, pageToken: string) => Promise<void>;
}

export function graphPageApi(creds: { appId: string; appSecret: string }, o: PageApiOptions = {}): PageApi {
  return {
    exchangeForLongLivedUserToken: (t) => exchangeForLongLivedUserToken(t, creds, o),
    listManagedPages: (t) => listManagedPages(t, o),
    subscribePage: (id, t) => subscribePage(id, t, o),
  };
}

/** A person needs a messaging-capable task on the Page for the Send API and webhooks to work. */
const MESSAGING_TASKS = new Set(["MESSAGING", "MANAGE"]);
const canMessage = (p: ManagedPage) => p.tasks.length === 0 || p.tasks.some((t) => MESSAGING_TASKS.has(t));

export interface PageChoice {
  id: string;
  name: string;
  canMessage: boolean;
}

/** Pages the logged-in person manages, WITHOUT their tokens, for the picker. */
export async function listPagesForPicker(api: PageApi, shortUserToken: string): Promise<{ ok: true; pages: PageChoice[] } | { ok: false; error: string }> {
  try {
    const longLived = await api.exchangeForLongLivedUserToken(shortUserToken);
    const pages = await api.listManagedPages(longLived);
    return { ok: true, pages: pages.map((p) => ({ id: p.id, name: p.name, canMessage: canMessage(p) })) };
  } catch (err) {
    return { ok: false, error: `পেজের তালিকা আনা যায়নি: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}` };
  }
}

export type PageConnectResult =
  | { ok: true; channelId: string; pageId: string; name: string }
  | { ok: false; code: "invalid_input" | "token_exchange" | "page_not_found" | "no_permission" | "subscribe_failed"; error: string };

export async function connectMessengerPage(
  db: Db,
  api: PageApi,
  input: { userToken: string; pageId: string; isTest: boolean },
): Promise<PageConnectResult> {
  if (!input.userToken || !/^\d+$/.test(input.pageId)) {
    return { ok: false, code: "invalid_input", error: "পেজের তথ্য ভুল।" };
  }

  let page: ManagedPage | undefined;
  try {
    const longLived = await api.exchangeForLongLivedUserToken(input.userToken);
    page = (await api.listManagedPages(longLived)).find((p) => p.id === input.pageId);
  } catch (err) {
    return { ok: false, code: "token_exchange", error: `Facebook থেকে তথ্য আনা যায়নি: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}` };
  }
  if (!page) return { ok: false, code: "page_not_found", error: "এই পেজ আপনার অ্যাকাউন্টে পাওয়া যায়নি।" };
  if (!canMessage(page)) {
    return { ok: false, code: "no_permission", error: "এই পেজে মেসেজ পরিচালনার অনুমতি (MESSAGING/MANAGE) আপনার নেই।" };
  }

  try {
    await api.subscribePage(page.id, page.accessToken);
  } catch (err) {
    return { ok: false, code: "subscribe_failed", error: `Webhook সংযোগ ব্যর্থ: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}` };
  }

  const [channel] = await db
    .insert(schema.channels)
    .values({
      type: "messenger",
      name: page.name,
      externalId: page.id,
      accessTokenEncrypted: encryptSecret(page.accessToken),
      status: "active",
      isTest: input.isTest,
    })
    .onConflictDoUpdate({
      target: [schema.channels.type, schema.channels.externalId],
      // Reconnecting refreshes name/token/status but keeps botEnabled and isTest as set.
      set: { name: page.name, accessTokenEncrypted: encryptSecret(page.accessToken), status: "active" },
    })
    .returning({ id: schema.channels.id });

  return { ok: true, channelId: channel.id, pageId: page.id, name: page.name };
}
