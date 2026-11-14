"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdapter } from "@/channels/registry";
import { requireUser } from "@/core/auth/dal";
import { db } from "@/db";
import { addNote, assignConversation, markRead, resumeBot, setConversationStatus, type MutationResult } from "./mutations";
import { sendReply } from "./send";
import { sendImageReply } from "./send-image";
import { sendTemplateToConversation } from "./send-template";

// Server Actions are public HTTP endpoints: every one re-checks the session and
// validates its input, regardless of what the UI shows.

export interface FormState {
  error?: string;
  /** Changes on every success so forms can reset themselves. */
  okAt?: number;
}

const idSchema = z.uuid();
const done = (): FormState => ({ okAt: Date.now() });

function finish(result: MutationResult): FormState {
  if (!result.ok) return { error: result.error };
  revalidatePath("/inbox");
  return done();
}

/** Staff send one approved WhatsApp template to this conversation's customer (after the 24h window). */
export async function sendTemplateAction(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const conversationId = idSchema.safeParse(formData.get("conversationId"));
  const templateId = idSchema.safeParse(formData.get("templateId"));
  const count = z.coerce.number().int().min(0).max(20).safeParse(formData.get("varCount"));
  if (!conversationId.success || !templateId.success || !count.success) return { error: "ভুল অনুরোধ।" };
  const params = Array.from({ length: count.data }, (_, i) => String(formData.get(`p${i + 1}`) ?? ""));

  const result = await sendTemplateToConversation(db, {}, { conversationId: conversationId.data, templateId: templateId.data, params, userId: user.id });
  if (!result.ok) return { error: result.error };
  revalidatePath("/inbox");
  return done();
}

export async function replyAction(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  if (!id.success) return { error: "ভুল অনুরোধ।" };

  // A picture was attached: send it (the text becomes its caption).
  const attached = formData.get("file");
  if (attached instanceof File && attached.size > 0) {
    const caption = String(formData.get("text") ?? "");
    const sent = await sendImageReply(
      db,
      { adapterFor: getAdapter },
      { conversationId: id.data, userId: user.id, file: { bytes: new Uint8Array(await attached.arrayBuffer()), mimeType: attached.type, fileName: attached.name || "photo" }, caption },
    );
    if (!sent.ok) return { error: sent.error };
    // Messenger has no caption under a picture: send the text as a second message.
    if (sent.captionAsText) {
      const text = await sendReply(db, { adapterFor: getAdapter }, { conversationId: id.data, text: sent.captionAsText, sender: "human", userId: user.id });
      if (!text.ok) return { error: text.error };
    }
    revalidatePath("/inbox");
    return done();
  }

  const result = await sendReply(
    db,
    { adapterFor: getAdapter },
    { conversationId: id.data, text: String(formData.get("text") ?? ""), sender: "human", userId: user.id },
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/inbox");
  return done();
}

export async function noteAction(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  if (!id.success) return { error: "ভুল অনুরোধ।" };
  return finish(await addNote(db, user, id.data, String(formData.get("body") ?? "")));
}

export async function assignAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  const raw = String(formData.get("userId") ?? "");
  const target = raw === "" ? null : idSchema.safeParse(raw);
  if (!id.success || (target !== null && !target.success)) return;
  await assignConversation(db, user, id.data, target === null ? null : target.data!);
  revalidatePath("/inbox");
}

export async function statusAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  const status = z.enum(["open", "closed"]).safeParse(formData.get("status"));
  if (!id.success || !status.success) return;
  await setConversationStatus(db, id.data, status.data);
  revalidatePath("/inbox");
}

export async function resumeBotAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  if (!id.success) return;
  await resumeBot(db, id.data);
  revalidatePath("/inbox");
}

export async function markReadAction(conversationId: string): Promise<void> {
  await requireUser();
  const id = idSchema.safeParse(conversationId);
  if (!id.success) return;
  await markRead(db, id.data);
}
