"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { addArticle, deleteArticle, saveAiSettings, setArticleEnabled, updateArticle } from "./admin";

// Admin-only; every action re-checks the role. The add / update / settings actions return a small
// state so the popup forms can show an error or close themselves after a success.

export interface KnowledgeFormState {
  error?: string;
  ok?: string;
  /** Changes on every success so forms can react to it. */
  okAt?: number;
}

const id = z.uuid();
const done = () => revalidatePath("/settings/knowledge");
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function addArticleAction(_prev: KnowledgeFormState, formData: FormData): Promise<KnowledgeFormState> {
  await requireRole("admin");
  const r = await addArticle(db, { title: str(formData, "title"), content: str(formData, "content") });
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function updateArticleAction(_prev: KnowledgeFormState, formData: FormData): Promise<KnowledgeFormState> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (!i.success) return { error: "ভুল অনুরোধ।" };
  const r = await updateArticle(db, i.data, { title: str(formData, "title"), content: str(formData, "content") });
  done();
  return r.ok ? { okAt: Date.now() } : { error: r.error };
}

export async function deleteArticleAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await deleteArticle(db, i.data);
  done();
}

export async function toggleArticleAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await setArticleEnabled(db, i.data, formData.get("enabled") === "true");
  done();
}

export async function saveAiSettingsAction(_prev: KnowledgeFormState, formData: FormData): Promise<KnowledgeFormState> {
  await requireRole("admin");
  const max = Number(formData.get("maxRepliesPerHour"));
  const r = await saveAiSettings(db, {
    enabled: formData.get("enabled") === "on",
    handoffText: str(formData, "handoffText"),
    maxRepliesPerHour: Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined,
  });
  done();
  return r.ok ? { ok: "সেভ হয়েছে।", okAt: Date.now() } : { error: r.error };
}
