"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { addArticle, deleteArticle, saveAiSettings, setArticleEnabled, updateArticle } from "./admin";

// Admin-only; every action re-checks the role.

const id = z.uuid();
const done = () => revalidatePath("/settings/knowledge");

export async function addArticleAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  await addArticle(db, { title: String(formData.get("title") ?? ""), content: String(formData.get("content") ?? "") });
  done();
}

export async function updateArticleAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await updateArticle(db, i.data, { title: String(formData.get("title") ?? ""), content: String(formData.get("content") ?? "") });
  done();
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

export async function saveAiSettingsAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const max = Number(formData.get("maxRepliesPerHour"));
  await saveAiSettings(db, {
    enabled: formData.get("enabled") === "on",
    handoffText: String(formData.get("handoffText") ?? ""),
    maxRepliesPerHour: Number.isFinite(max) && max > 0 ? Math.floor(max) : undefined,
  });
  done();
}
