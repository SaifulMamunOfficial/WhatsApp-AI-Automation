"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { removeProviderKey, saveProvider, testProvider } from "./config";

// Admin-only; every action re-checks the role. The API key is read from the form on the server
// and is never returned or logged.

export interface ConfigFormState {
  ok?: string;
  error?: string;
}

const done = () => {
  revalidatePath("/settings/configuration");
  revalidatePath("/settings/knowledge");
};

export async function saveProviderAction(_prev: ConfigFormState, formData: FormData): Promise<ConfigFormState> {
  await requireRole("admin");
  const r = await saveProvider(db, {
    provider: String(formData.get("provider") ?? ""),
    apiKey: String(formData.get("apiKey") ?? ""),
    model: String(formData.get("model") ?? ""),
    makeActive: formData.get("active") === "on",
  });
  done();
  return r.ok ? { ok: "সেভ হয়েছে।" } : { error: r.error };
}

export async function testProviderAction(_prev: ConfigFormState, formData: FormData): Promise<ConfigFormState> {
  await requireRole("admin");
  const r = await testProvider(db, String(formData.get("provider") ?? ""));
  return r.ok ? { ok: "সংযোগ ঠিক আছে, key কাজ করছে।" } : { error: r.error };
}

export async function removeKeyAction(formData: FormData): Promise<void> {
  await requireRole("admin");
  await removeProviderKey(db, String(formData.get("provider") ?? ""));
  done();
}
