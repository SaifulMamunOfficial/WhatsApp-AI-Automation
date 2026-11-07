import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { ensureIdentityByKey, type Db, type Tx } from "@/core/inbox/ingest";
import { mapHeaders, parseCsv } from "./csv";
import { normalizePhone } from "./phone";

// CSV import of customers into the CRM (they appear as contacts on a WhatsApp channel, ready
// for tags and, later, broadcasts). Only import people who have agreed to hear from the
// business: WhatsApp requires opt-in for template broadcasts (step 12).

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export interface ImportResult {
  dryRun: boolean;
  created: number;
  updated: number;
  /** Rows repeating a number already seen earlier in the same file. */
  duplicatesInFile: number;
  tagsCreated: number;
  errors: { line: number; message: string }[];
  /** A fatal problem with the file or channel (nothing was imported). */
  fatal?: string;
}

class DryRunRollback extends Error {
  constructor(readonly result: ImportResult) {
    super("dry run");
  }
}

const empty = (dryRun: boolean): ImportResult => ({ dryRun, created: 0, updated: 0, duplicatesInFile: 0, tagsCreated: 0, errors: [] });

export async function importContactsCsv(
  db: Db,
  input: { channelId: string; csv: string; extraTag?: string; dryRun: boolean },
): Promise<ImportResult> {
  const result = empty(input.dryRun);
  const fail = (m: string): ImportResult => ({ ...result, fatal: m });

  if (input.csv.length > MAX_IMPORT_BYTES) return fail("ফাইল ২ MB-এর বেশি।");
  const [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, input.channelId)).limit(1);
  if (!channel || channel.type !== "whatsapp") return fail("আমদানির জন্য একটি WhatsApp চ্যানেল বেছে নিন।");

  const rows = parseCsv(input.csv);
  if (rows.length === 0) return fail("ফাইল খালি।");
  const cols = mapHeaders(rows[0]);
  if (cols.phone === undefined) return fail("ফোন নম্বরের কলাম পাওয়া যায়নি। প্রথম সারিতে কলামের নাম দিন (যেমন: name, phone, tags)।");
  const data = rows.slice(1);
  if (data.length === 0) return fail("হেডারের নিচে কোনো সারি নেই।");
  if (data.length > MAX_IMPORT_ROWS) return fail(`একবারে সর্বোচ্চ ${MAX_IMPORT_ROWS}টি সারি।`);

  const extra = input.extraTag?.trim();
  if (extra && extra.length > 40) return fail("ট্যাগের নাম সর্বোচ্চ ৪০ অক্ষর।");

  const run = async (tx: Tx) => {
    const tagIds = new Map<string, string>(); // lower-case name -> id
    const tagId = async (name: string) => {
      const key = name.toLowerCase();
      const cached = tagIds.get(key);
      if (cached) return cached;
      const t = schema.tags;
      const [found] = await tx.select({ id: t.id }).from(t).where(sql`lower(${t.name}) = ${key}`).limit(1);
      let id = found?.id;
      if (!id) {
        [{ id }] = await tx.insert(t).values({ name }).returning({ id: t.id });
        result.tagsCreated++;
      }
      tagIds.set(key, id);
      return id;
    };

    const seen = new Set<string>();
    for (let i = 0; i < data.length; i++) {
      const line = i + 2; // 1-based, header is line 1
      const row = data[i];
      const phone = normalizePhone(row[cols.phone!] ?? "");
      if (!phone) {
        result.errors.push({ line, message: `ফোন নম্বর ঠিক নয়: "${(row[cols.phone!] ?? "").trim().slice(0, 30)}"` });
        continue;
      }
      const name = cols.name !== undefined ? (row[cols.name] ?? "").trim().slice(0, 200) : "";
      const tagNames = [...(cols.tags !== undefined ? (row[cols.tags] ?? "").split(/[;|,،]/) : []), ...(extra ? [extra] : [])]
        .map((t) => t.trim().replace(/\s+/g, " "))
        .filter(Boolean);
      if (tagNames.some((t) => t.length > 40)) {
        result.errors.push({ line, message: "ট্যাগের নাম ৪০ অক্ষরের বেশি।" });
        continue;
      }

      const existed = (await tx
        .select({ id: schema.contactIdentities.id })
        .from(schema.contactIdentities)
        .where(sql`${schema.contactIdentities.channelId} = ${channel.id} and ${schema.contactIdentities.externalId} = ${phone}`)
        .limit(1)).length > 0;
      if (seen.has(phone)) result.duplicatesInFile++;
      else if (existed) result.updated++;
      else result.created++;
      seen.add(phone);

      // Fills the name only if the contact has none: an import never overwrites what is known.
      const identity = await ensureIdentityByKey(tx, channel.id, phone, name || undefined);
      for (const t of tagNames) {
        await tx.insert(schema.contactTags).values({ contactId: identity.contactId, tagId: await tagId(t) }).onConflictDoNothing();
      }
    }
    if (input.dryRun) throw new DryRunRollback(result);
    return result;
  };

  try {
    return await db.transaction(run);
  } catch (err) {
    if (err instanceof DryRunRollback) return err.result; // nothing was saved
    throw err;
  }
}
