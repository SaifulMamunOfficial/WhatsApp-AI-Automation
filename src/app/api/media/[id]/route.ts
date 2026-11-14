import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/core/auth/session";
import { readMedia } from "@/core/media/storage";
import { serveHeaders } from "@/core/media/types";
import { db } from "@/db";
import { messageMedia } from "@/db/schema";

// Serves a stored customer file to a signed-in staff member. Files are private: no session, no file.
// The id is a random UUID, the response says exactly what the file is and never lets the browser
// guess, and documents are downloaded rather than opened.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return new Response("Unauthorized", { status: 401 });

  const id = z.uuid().safeParse((await ctx.params).id);
  if (!id.success) return new Response("Not found", { status: 404 });

  const [row] = await db.select().from(messageMedia).where(eq(messageMedia.id, id.data)).limit(1);
  if (!row || row.status !== "ready" || !row.storageKey || !row.mimeType) return new Response("Not found", { status: 404 });

  const bytes = await readMedia(row.storageKey);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: serveHeaders(row.mimeType, row.fileName, bytes.length) });
}
