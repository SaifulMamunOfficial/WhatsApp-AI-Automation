"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdapter } from "@/channels/registry";
import { requireUser } from "@/core/auth/dal";
import { db } from "@/db";
import { addNote, assignConversation, markRead, resumeBot, setConversationStatus, type MutationResult } from "./mutations";
import { sendReply } from "./send";

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

export async function replyAction(_prev: FormState | undefined, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = idSchema.safeParse(formData.get("conversationId"));
  if (!id.success) return { error: "ভুল অনুরোধ।" };

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
