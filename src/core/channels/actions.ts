"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { completeCoexistenceOnboarding, graphOnboardingApi, requestSyncOnce, type OnboardingResult } from "./onboarding";
import { isRealChannelConnectAllowed } from "./config";
import { connectMessengerPage, graphPageApi, listPagesForPicker, type PageChoice, type PageConnectResult } from "./page-onboarding";
import { eq } from "drizzle-orm";
import { whatsappSyncState } from "@/db/schema";

// Connecting a REAL WhatsApp number is a go-live step (CLAUDE.md step 14). It needs an admin
// AND the explicit ALLOW_REAL_CHANNEL_CONNECT=true switch, so it cannot happen by accident
// while developing with the Meta test number.

const connectSchema = z.object({
  code: z.string().min(1).max(2048),
  wabaId: z.string().regex(/^\d+$/),
  phoneNumberId: z.string().regex(/^\d+$/).optional(),
});

export type ConnectResult = OnboardingResult | { ok: false; code: "forbidden" | "not_configured"; error: string };

export async function connectWhatsAppAction(raw: unknown): Promise<ConnectResult> {
  await requireRole("admin");

  if (!isRealChannelConnectAllowed()) {
    return { ok: false, code: "forbidden", error: "আসল নম্বর সংযুক্ত করা বন্ধ আছে (ALLOW_REAL_CHANNEL_CONNECT)। এটা go-live ধাপে চালু করতে হয়।" };
  }
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { ok: false, code: "not_configured", error: "META_APP_ID বা META_APP_SECRET সেট করা নেই।" };
  }

  const parsed = connectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid_input", error: "অনবোর্ডিংয়ের তথ্য ভুল।" };

  const result = await completeCoexistenceOnboarding(db, graphOnboardingApi({ appId, appSecret }), parsed.data);
  revalidatePath("/settings/channels");
  return result;
}

/** Retries a sync request that failed (only possible within 24h of onboarding, and only once it succeeds). */
export async function retrySyncAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const channelId = z.uuid().safeParse(formData.get("channelId"));
  const type = z.enum(["smb_app_state_sync", "history"]).safeParse(formData.get("syncType"));
  if (!channelId.success || !type.success) return;

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return;

  const outcome = await requestSyncOnce(db, graphOnboardingApi({ appId, appSecret }), channelId.data, type.data);
  if (outcome === "requested") {
    // Clear the note once nothing is left to retry.
    const [s] = await db.select().from(whatsappSyncState).where(eq(whatsappSyncState.channelId, channelId.data)).limit(1);
    if (s?.contactsRequestedAt && s?.historyRequestedAt) {
      await db.update(whatsappSyncState).set({ lastError: null }).where(eq(whatsappSyncState.channelId, channelId.data));
    }
  }
  revalidatePath("/settings/channels");
}

// ---- Facebook Pages (Messenger) -------------------------------------------------------

const pageConnectSchema = z.object({
  userToken: z.string().min(1).max(4096),
  pageId: z.string().regex(/^\d+$/),
  isTest: z.boolean(),
});

function metaCreds() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  return appId && appSecret ? { appId, appSecret } : null;
}

/** Pages the logged-in Facebook user manages. Returns names and ids only, never tokens. */
export async function listPagesAction(userToken: unknown): Promise<{ ok: true; pages: PageChoice[] } | { ok: false; error: string }> {
  await requireRole("admin");
  const creds = metaCreds();
  if (!creds) return { ok: false, error: "META_APP_ID বা META_APP_SECRET সেট করা নেই।" };
  const token = z.string().min(1).max(4096).safeParse(userToken);
  if (!token.success) return { ok: false, error: "Facebook লগইনের তথ্য ভুল।" };
  return listPagesForPicker(graphPageApi(creds), token.data);
}

/**
 * Connects a Facebook Page. A page marked as test can be connected any time; a real page
 * needs the ALLOW_REAL_CHANNEL_CONNECT switch (go-live step, CLAUDE.md step 14).
 */
export async function connectPageAction(raw: unknown): Promise<PageConnectResult | { ok: false; code: "forbidden" | "not_configured"; error: string }> {
  await requireRole("admin");
  const creds = metaCreds();
  if (!creds) return { ok: false, code: "not_configured", error: "META_APP_ID বা META_APP_SECRET সেট করা নেই।" };

  const parsed = pageConnectSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "invalid_input", error: "পেজের তথ্য ভুল।" };
  if (!parsed.data.isTest && !isRealChannelConnectAllowed()) {
    return { ok: false, code: "forbidden", error: "আসল পেজ সংযুক্ত করা বন্ধ আছে (ALLOW_REAL_CHANNEL_CONNECT)। টেস্ট পেজ হলে 'টেস্ট পেজ' টিক দিন।" };
  }

  const result = await connectMessengerPage(db, graphPageApi(creds), parsed.data);
  revalidatePath("/settings/channels");
  return result;
}
