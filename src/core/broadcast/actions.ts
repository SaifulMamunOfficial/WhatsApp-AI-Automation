"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireRole } from "@/core/auth/dal";
import { setOptIn } from "@/core/contacts/consent";
import { db } from "@/db";
import { sendWhatsAppTemplate } from "@/channels/whatsapp/templates";
import { cancelBroadcast, createBroadcast, pauseBroadcast, processBroadcast, startBroadcast, type ParamSpec } from "./engine";
import { graphTemplateApi, submitTemplate, syncTemplates } from "./templates";

// Broadcasts and templates are admin-only: they cost money and can restrict the number.

const id = z.uuid();

export interface BroadcastFormState {
  error?: string;
  ok?: string;
}

export async function syncTemplatesAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const ch = id.safeParse(formData.get("channelId"));
  if (ch.success) await syncTemplates(db, graphTemplateApi(), ch.data);
  revalidatePath("/broadcasts/templates");
}

export async function submitTemplateAction(_prev: BroadcastFormState | undefined, formData: FormData): Promise<BroadcastFormState> {
  await requireRole("admin");
  const ch = id.safeParse(formData.get("channelId"));
  const category = z.enum(["marketing", "utility"]).safeParse(formData.get("category"));
  if (!ch.success || !category.success) return { error: "চ্যানেল ও ক্যাটাগরি বেছে নিন।" };
  const examples = String(formData.get("examples") ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const r = await submitTemplate(db, graphTemplateApi(), ch.data, {
    name: String(formData.get("name") ?? "").trim(),
    language: String(formData.get("language") ?? "bn").trim() || "bn",
    category: category.data,
    bodyText: String(formData.get("bodyText") ?? "").trim(),
    examples,
  });
  revalidatePath("/broadcasts/templates");
  return r.ok ? { ok: "টেমপ্লেট Meta-র কাছে জমা হয়েছে। অনুমোদন পেলে (সাধারণত কিছুক্ষণে) 'approved' হবে।" } : { error: r.error };
}

/** Creates a draft broadcast with a frozen recipient list, then opens its confirmation page. */
export async function createBroadcastAction(_prev: BroadcastFormState | undefined, formData: FormData): Promise<BroadcastFormState> {
  const user = await requireRole("admin");
  const channelId = id.safeParse(formData.get("channelId"));
  const templateId = id.safeParse(formData.get("templateId"));
  const tag = String(formData.get("tagId") ?? "");
  const tagId = tag ? id.safeParse(tag) : null;
  if (!channelId.success || !templateId.success || (tagId && !tagId.success)) return { error: "চ্যানেল ও টেমপ্লেট বেছে নিন।" };

  // Variables arrive as p1_kind/p1_value ... in order.
  const params: ParamSpec[] = [];
  for (let i = 1; i <= 20; i++) {
    const kind = formData.get(`p${i}_kind`);
    if (!kind) break;
    const value = String(formData.get(`p${i}_value`) ?? "").trim();
    params.push(kind === "first_name" ? { kind: "first_name", fallback: value } : { kind: "fixed", value });
  }

  const r = await createBroadcast(db, {
    name: String(formData.get("name") ?? ""),
    channelId: channelId.data,
    templateId: templateId.data,
    tagId: tagId && tagId.success ? tagId.data : null,
    params,
    createdBy: user.id,
  });
  if (!r.ok) return { error: r.error };
  redirect(`/broadcasts/${r.broadcastId}`);
}

export async function startBroadcastAction(_prev: BroadcastFormState | undefined, formData: FormData): Promise<BroadcastFormState> {
  await requireRole("admin");
  const b = id.safeParse(formData.get("id"));
  if (!b.success) return { error: "ভুল অনুরোধ।" };
  const r = await startBroadcast(db, b.data, Number(String(formData.get("confirmCount") ?? "").trim()));
  if (!r.ok) return { error: r.error };
  runInBackground(b.data);
  revalidatePath(`/broadcasts/${b.data}`);
  return { ok: "পাঠানো শুরু হয়েছে।" };
}

/** Continues a paused/interrupted broadcast (same confirmation as starting). */
export async function continueBroadcastAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const b = id.safeParse(formData.get("id"));
  if (!b.success) return;
  runInBackground(b.data);
  revalidatePath(`/broadcasts/${b.data}`);
}

export async function pauseBroadcastAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const b = id.safeParse(formData.get("id"));
  if (b.success) {
    await pauseBroadcast(db, b.data);
    revalidatePath(`/broadcasts/${b.data}`);
  }
}

export async function cancelBroadcastAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const b = id.safeParse(formData.get("id"));
  if (b.success) {
    await cancelBroadcast(db, b.data);
    revalidatePath(`/broadcasts/${b.data}`);
  }
}

export async function setOptInAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const c = id.safeParse(formData.get("contactId"));
  if (!c.success) return;
  await setOptIn(db, c.data, formData.get("optedIn") === "true", "manual");
  revalidatePath(`/contacts/${c.data}`);
}

/** Sends after the response, throttled (about 6 messages/second). Resumable if the process dies. */
function runInBackground(broadcastId: string) {
  after(async () => {
    try {
      await processBroadcast(
        db,
        {
          delayMs: 160,
          sendTemplate: (input) => sendWhatsAppTemplate(input),
        },
        broadcastId,
      );
    } catch (err) {
      console.error("[broadcast] processing failed", err);
    }
  });
}
