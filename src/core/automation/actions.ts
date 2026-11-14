"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { addKeywordRule, deleteAutomation, saveSimpleAutomation, setAutomationEnabled, setBotMode } from "./admin";

// All automation settings are admin-only; every action re-checks the role.

const id = z.uuid();
const done = () => revalidatePath("/settings/automations");

export async function saveSimpleAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const kind = z.enum(["welcome", "office_hours"]).safeParse(formData.get("kind"));
  if (!kind.success) return;
  await saveSimpleAutomation(db, kind.data, String(formData.get("text") ?? ""), formData.get("enabled") === "on");
  done();
}

export async function addKeywordAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const match = z.enum(["contains", "exact"]).catch("contains").parse(formData.get("match"));
  await addKeywordRule(db, {
    name: String(formData.get("name") ?? ""),
    keywordsCsv: String(formData.get("keywords") ?? ""),
    reply: String(formData.get("reply") ?? ""),
    match,
  });
  done();
}

export async function deleteAutomationAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await deleteAutomation(db, i.data);
  done();
}

export async function toggleAutomationAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("id"));
  if (i.success) await setAutomationEnabled(db, i.data, formData.get("enabled") === "true");
  done();
}

export async function setBotModeAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  const i = id.safeParse(formData.get("channelId"));
  if (i.success) await setBotMode(db, i.data, String(formData.get("mode") ?? ""));
  done();
}
