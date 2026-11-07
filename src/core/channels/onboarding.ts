import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import type { Db } from "@/core/inbox/ingest";
import {
  exchangeCodeForToken,
  getPhoneNumber,
  listWabaPhoneNumbers,
  requestSync,
  subscribeApp,
  type CoexistenceApiOptions,
  type PhoneNumberInfo,
  type SyncType,
} from "@/channels/whatsapp/coexistence";

// Completes a WhatsApp Coexistence onboarding after Embedded Signup finished in the browser.
// Never registers the number (see src/channels/whatsapp/coexistence.ts).

export interface OnboardingApi {
  exchangeCodeForToken: (code: string) => Promise<string>;
  getPhoneNumber: (phoneNumberId: string, token: string) => Promise<PhoneNumberInfo>;
  listWabaPhoneNumbers: (wabaId: string, token: string) => Promise<{ id: string }[]>;
  subscribeApp: (wabaId: string, token: string) => Promise<void>;
  requestSync: (phoneNumberId: string, syncType: SyncType, token: string) => Promise<string>;
}

/** The real Graph API implementation. */
export function graphOnboardingApi(
  creds: { appId: string; appSecret: string },
  o: CoexistenceApiOptions = {},
): OnboardingApi {
  return {
    exchangeCodeForToken: (code) => exchangeCodeForToken(code, creds, o),
    getPhoneNumber: (id, token) => getPhoneNumber(id, token, o),
    listWabaPhoneNumbers: (waba, token) => listWabaPhoneNumbers(waba, token, o),
    subscribeApp: (waba, token) => subscribeApp(waba, token, o),
    requestSync: (id, type, token) => requestSync(id, type, token, o),
  };
}

export interface OnboardingInput {
  /** From FB.login: authResponse.code (valid for 30 seconds). */
  code: string;
  /** From the Embedded Signup session event. */
  wabaId: string;
  /** From the session event when present; otherwise looked up from the WABA. */
  phoneNumberId?: string;
}

export type OnboardingResult =
  | {
      ok: true;
      channelId: string;
      phoneNumberId: string;
      displayPhone?: string;
      contacts: "requested" | "already_requested" | "failed";
      history: "requested" | "already_requested" | "failed";
      warnings: string[];
    }
  | { ok: false; code: "invalid_input" | "token_exchange" | "no_phone_number" | "not_business_app" | "subscribe_failed"; error: string };

const SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;

const message = (err: unknown) => (err instanceof Error ? err.message : "unknown error");

export async function completeCoexistenceOnboarding(
  db: Db,
  api: OnboardingApi,
  input: OnboardingInput,
  now: () => Date = () => new Date(),
): Promise<OnboardingResult> {
  const code = input.code?.trim();
  const wabaId = input.wabaId?.trim();
  if (!code || !wabaId || !/^\d+$/.test(wabaId) || (input.phoneNumberId && !/^\d+$/.test(input.phoneNumberId))) {
    return { ok: false, code: "invalid_input", error: "অনবোর্ডিংয়ের তথ্য অসম্পূর্ণ বা ভুল।" };
  }

  // 1. Business token. Do this first: the code dies after 30 seconds.
  let token: string;
  try {
    token = await api.exchangeCodeForToken(code);
  } catch (err) {
    return { ok: false, code: "token_exchange", error: `টোকেন আনা যায়নি: ${message(err)}` };
  }

  // 2. Which number? Coexistence onboards exactly one.
  let phoneNumberId = input.phoneNumberId;
  if (!phoneNumberId) {
    try {
      const numbers = await api.listWabaPhoneNumbers(wabaId, token);
      if (numbers.length !== 1) {
        return {
          ok: false,
          code: "no_phone_number",
          error: numbers.length === 0 ? "এই WhatsApp অ্যাকাউন্টে কোনো নম্বর পাওয়া যায়নি।" : "একাধিক নম্বর পাওয়া গেছে; একটি একটি করে যুক্ত করুন।",
        };
      }
      phoneNumberId = numbers[0].id;
    } catch (err) {
      return { ok: false, code: "no_phone_number", error: `নম্বর খুঁজে পাওয়া যায়নি: ${message(err)}` };
    }
  }

  // 3. Safety gate: only a number that still lives in the WhatsApp Business App qualifies.
  let info: PhoneNumberInfo;
  try {
    info = await api.getPhoneNumber(phoneNumberId, token);
  } catch (err) {
    return { ok: false, code: "not_business_app", error: `নম্বর যাচাই করা যায়নি: ${message(err)}` };
  }
  if (info.isOnBizApp !== true) {
    return {
      ok: false,
      code: "not_business_app",
      error: "এই নম্বরটি WhatsApp Business App-এ চালু নেই, তাই Coexistence-এ যুক্ত করা হয়নি। কিছুই বদলানো হয়নি।",
    };
  }

  // 4. Webhooks for this WABA.
  try {
    await api.subscribeApp(wabaId, token);
  } catch (err) {
    return { ok: false, code: "subscribe_failed", error: `Webhook সংযোগ ব্যর্থ: ${message(err)}` };
  }

  // 5. Save the channel (token encrypted). Real channels start with the bot OFF.
  const values = {
    type: "whatsapp" as const,
    name: info.verifiedName ?? info.displayPhoneNumber ?? "WhatsApp",
    externalId: phoneNumberId,
    wabaId,
    displayPhone: info.displayPhoneNumber ?? null,
    accessTokenEncrypted: encryptSecret(token),
    status: "active" as const,
  };
  const [channel] = await db
    .insert(schema.channels)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.channels.type, schema.channels.externalId],
      // Re-onboarding refreshes the token and status but keeps isTest/botEnabled as they are.
      set: { wabaId: values.wabaId, displayPhone: values.displayPhone, accessTokenEncrypted: values.accessTokenEncrypted, status: "active" },
    })
    .returning({ id: schema.channels.id });

  await db.insert(schema.whatsappSyncState).values({ channelId: channel.id, onboardedAt: now() }).onConflictDoNothing();

  // 6. One-time syncs: contacts, then history.
  const warnings: string[] = [];
  const contacts = await requestSyncOnce(db, api, channel.id, "smb_app_state_sync", now);
  const history = await requestSyncOnce(db, api, channel.id, "history", now);
  if (contacts === "failed") warnings.push("কন্টাক্ট সিঙ্কের অনুরোধ ব্যর্থ; পরে আবার চেষ্টা করুন (২৪ ঘণ্টার মধ্যে)।");
  if (history === "failed") warnings.push("চ্যাট history সিঙ্কের অনুরোধ ব্যর্থ; পরে আবার চেষ্টা করুন (২৪ ঘণ্টার মধ্যে)।");

  // One combined note, so a failure of one sync is never hidden by the success of the other.
  await db
    .update(schema.whatsappSyncState)
    .set({ lastError: warnings.length ? warnings.join(" ") : null, updatedAt: now() })
    .where(eq(schema.whatsappSyncState.channelId, channel.id));

  return {
    ok: true,
    channelId: channel.id,
    phoneNumberId,
    displayPhone: info.displayPhoneNumber,
    contacts,
    history,
    warnings,
  };
}

/**
 * Requests a sync from Meta unless it was already requested for this onboarding.
 * Meta allows each sync once, within 24h of onboarding; repeating needs offboarding and a
 * new signup, so we must never send a second request.
 */
export async function requestSyncOnce(
  db: Db,
  api: Pick<OnboardingApi, "requestSync">,
  channelId: string,
  syncType: SyncType,
  now: () => Date = () => new Date(),
): Promise<"requested" | "already_requested" | "failed"> {
  const s = schema.whatsappSyncState;
  const [state] = await db.select().from(s).where(eq(s.channelId, channelId)).limit(1);
  const [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, channelId)).limit(1);
  if (!state || !channel?.accessTokenEncrypted) return "failed";

  const isHistory = syncType === "history";
  if (isHistory ? state.historyRequestedAt : state.contactsRequestedAt) return "already_requested";

  if (now().getTime() - state.onboardedAt.getTime() > SYNC_WINDOW_MS) {
    await db.update(s).set({ lastError: "২৪ ঘণ্টা পার; sync চাওয়া যাবে না। নম্বর offboard করে আবার সংযুক্ত করতে হবে।", updatedAt: now() }).where(eq(s.channelId, channelId));
    return "failed";
  }

  try {
    const requestId = await api.requestSync(channel.externalId, syncType, decryptSecret(channel.accessTokenEncrypted));
    await db
      .update(s)
      .set(
        isHistory
          ? { historyRequestedAt: now(), historyRequestId: requestId, historyStatus: "requested", updatedAt: now() }
          : { contactsRequestedAt: now(), contactsRequestId: requestId, updatedAt: now() },
      )
      .where(eq(s.channelId, channelId));
    return "requested";
  } catch (err) {
    await db.update(s).set({ lastError: message(err), updatedAt: now() }).where(eq(s.channelId, channelId));
    return "failed";
  }
}
