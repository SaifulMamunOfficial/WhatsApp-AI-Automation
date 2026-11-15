import { asc, eq, ne, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";

export const ALLOWED_STAGE_COLORS = [
  "blue",
  "sky",
  "emerald",
  "amber",
  "orange",
  "violet",
  "rose",
  "slate",
] as const;

export type StageColorKey = (typeof ALLOWED_STAGE_COLORS)[number];

export interface LifecycleStageRow {
  id: string;
  name: string;
  colorKey: StageColorKey;
  sortOrder: number;
  isDefault: boolean;
  createdAt: Date;
}

export type StageErrorCode = "forbidden" | "invalid_input" | "not_found" | "conflict";

export type StageResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: StageErrorCode; error: string };

const fail = <T = void>(code: StageErrorCode, error: string): StageResult<T> => ({
  ok: false,
  code,
  error,
});

/** List all lifecycle stages ordered by sortOrder ascending. */
export async function listLifecycleStages(db: Db): Promise<LifecycleStageRow[]> {
  const rows = await db
    .select()
    .from(schema.lifecycleStages)
    .orderBy(asc(schema.lifecycleStages.sortOrder), asc(schema.lifecycleStages.createdAt));
  return rows.map((r) => ({
    ...r,
    colorKey: r.colorKey as StageColorKey,
  }));
}

/** Get the default stage. */
export async function getDefaultLifecycleStage(db: Db): Promise<LifecycleStageRow | null> {
  const [row] = await db
    .select()
    .from(schema.lifecycleStages)
    .where(eq(schema.lifecycleStages.isDefault, true))
    .limit(1);
  return row ? { ...row, colorKey: row.colorKey as StageColorKey } : null;
}

/** Admin only: Create a new stage. */
export async function createLifecycleStage(
  db: Db,
  input: { name: string; colorKey: string; isDefault?: boolean },
  actorRole: "admin" | "agent",
): Promise<StageResult<LifecycleStageRow>> {
  if (actorRole !== "admin") {
    return fail("forbidden", "শুধুমাত্র অ্যাডমিন নতুন স্টেজ তৈরি করতে পারেন।");
  }

  const name = input.name.trim();
  if (!name || name.length > 50) {
    return fail("invalid_input", "স্টেজের নাম ১ থেকে ৫০ অক্ষরের মধ্যে হতে হবে।");
  }

  const colorKey = input.colorKey as StageColorKey;
  if (!ALLOWED_STAGE_COLORS.includes(colorKey)) {
    return fail("invalid_input", "অনুমোদিত রঙের তালিকা থেকে নির্বাচন করুন।");
  }

  const isDefault = Boolean(input.isDefault);

  return db.transaction(async (tx) => {
    // If setting as default, clear existing default first
    if (isDefault) {
      await tx
        .update(schema.lifecycleStages)
        .set({ isDefault: false })
        .where(eq(schema.lifecycleStages.isDefault, true));
    }

    const [{ maxOrder }] = await tx
      .select({ maxOrder: sql<number>`coalesce(max(${schema.lifecycleStages.sortOrder}), 0)::int` })
      .from(schema.lifecycleStages);

    const [created] = await tx
      .insert(schema.lifecycleStages)
      .values({
        name,
        colorKey,
        sortOrder: maxOrder + 1,
        isDefault,
      })
      .returning();

    return {
      ok: true,
      data: {
        ...created,
        colorKey: created.colorKey as StageColorKey,
      },
    };
  });
}

/** Admin only: Update an existing stage. */
export async function updateLifecycleStage(
  db: Db,
  id: string,
  input: { name?: string; colorKey?: string; isDefault?: boolean; sortOrder?: number },
  actorRole: "admin" | "agent",
): Promise<StageResult<LifecycleStageRow>> {
  if (actorRole !== "admin") {
    return fail("forbidden", "শুধুমাত্র অ্যাডমিন স্টেজ সম্পাদনা করতে পারেন।");
  }

  const [existing] = await db
    .select()
    .from(schema.lifecycleStages)
    .where(eq(schema.lifecycleStages.id, id))
    .limit(1);

  if (!existing) {
    return fail("not_found", "স্টেজ পাওয়া যায়নি।");
  }

  const patch: Partial<typeof schema.lifecycleStages.$inferInsert> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 50) {
      return fail("invalid_input", "স্টেজের নাম ১ থেকে ৫০ অক্ষরের মধ্যে হতে হবে।");
    }
    patch.name = name;
  }

  if (input.colorKey !== undefined) {
    const colorKey = input.colorKey as StageColorKey;
    if (!ALLOWED_STAGE_COLORS.includes(colorKey)) {
      return fail("invalid_input", "অনুমোদিত রঙের তালিকা থেকে নির্বাচন করুন।");
    }
    patch.colorKey = colorKey;
  }

  if (input.sortOrder !== undefined && Number.isInteger(input.sortOrder)) {
    patch.sortOrder = input.sortOrder;
  }

  return db.transaction(async (tx) => {
    if (input.isDefault === true && !existing.isDefault) {
      await tx
        .update(schema.lifecycleStages)
        .set({ isDefault: false })
        .where(ne(schema.lifecycleStages.id, id));
      patch.isDefault = true;
    } else if (input.isDefault === false && existing.isDefault) {
      return fail("conflict", "একটি ডিফল্ট স্টেজ অবশ্যই থাকতে হবে। অন্য স্টেজকে ডিফল্ট করুন।");
    }

    const [updated] = await tx
      .update(schema.lifecycleStages)
      .set(patch)
      .where(eq(schema.lifecycleStages.id, id))
      .returning();

    return {
      ok: true,
      data: {
        ...updated,
        colorKey: updated.colorKey as StageColorKey,
      },
    };
  });
}

/** Admin only: Delete a stage (reassigns contacts to default stage). */
export async function deleteLifecycleStage(
  db: Db,
  id: string,
  actorRole: "admin" | "agent",
): Promise<StageResult> {
  if (actorRole !== "admin") {
    return fail("forbidden", "শুধুমাত্র অ্যাডমিন স্টেজ মুছে ফেলতে পারেন।");
  }

  const [stage] = await db
    .select()
    .from(schema.lifecycleStages)
    .where(eq(schema.lifecycleStages.id, id))
    .limit(1);

  if (!stage) {
    return fail("not_found", "স্টেজ পাওয়া যায়নি।");
  }

  if (stage.isDefault) {
    return fail("conflict", "ডিফল্ট স্টেজ মুছে ফেলা যাবে না। প্রথমে অন্য কোনো স্টেজকে ডিফল্ট করুন।");
  }

  return db.transaction(async (tx) => {
    // Find default stage to reassign contacts to
    const [def] = await tx
      .select({ id: schema.lifecycleStages.id })
      .from(schema.lifecycleStages)
      .where(eq(schema.lifecycleStages.isDefault, true))
      .limit(1);

    if (def) {
      await tx
        .update(schema.contacts)
        .set({ stageId: def.id, updatedAt: new Date() })
        .where(eq(schema.contacts.stageId, id));
    }

    await tx.delete(schema.lifecycleStages).where(eq(schema.lifecycleStages.id, id));
    return { ok: true, data: undefined };
  });
}

/** Both Admin and Agent can change a contact's lifecycle stage. */
export async function updateContactStage(
  db: Db,
  contactId: string,
  stageId: string | null,
  actorRole?: "admin" | "agent",
): Promise<StageResult> {
  if (actorRole && actorRole !== "admin" && actorRole !== "agent") {
    return fail("forbidden", "শুধুমাত্র অ্যাডমিন বা এজেন্ট স্টেজ বদলাতে পারবে।");
  }

  if (stageId !== null) {
    const [valid] = await db
      .select({ id: schema.lifecycleStages.id })
      .from(schema.lifecycleStages)
      .where(eq(schema.lifecycleStages.id, stageId))
      .limit(1);

    if (!valid) {
      return fail("not_found", "নির্বাচিত স্টেজটি বিদ্যমান নেই।");
    }
  }

  const [contact] = await db
    .select({ id: schema.contacts.id })
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);

  if (!contact) {
    return fail("not_found", "কন্টাক্ট পাওয়া যায়নি।");
  }

  await db
    .update(schema.contacts)
    .set({ stageId, updatedAt: new Date() })
    .where(eq(schema.contacts.id, contactId));

  return { ok: true, data: undefined };
}
