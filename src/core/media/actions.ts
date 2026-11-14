"use server";

import { after } from "next/server";
import { z } from "zod";
import { requireUser } from "@/core/auth/dal";
import { downloadAndNotify } from "./notify";

// Any signed-in staff member may ask to try a failed download again.
export async function retryMediaAction(formData: FormData): Promise<void> {
  await requireUser();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  after(async () => {
    try {
      await downloadAndNotify(id.data);
    } catch (err) {
      console.error("[media] retry failed", err instanceof Error ? err.message : "unknown error");
    }
  });
}
