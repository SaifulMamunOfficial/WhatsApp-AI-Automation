import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import type { Db } from "@/core/inbox/ingest";

export interface ContactExportFilter {
  stageId?: string;
  optedIn?: boolean;
  search?: string;
  /** Filter by last customer contact/message date range (YYYY-MM-DD) */
  fromDate?: string;
  toDate?: string;
  fromLastContactDate?: string;
  toLastContactDate?: string;
  /** Filter by contact creation date range (YYYY-MM-DD) */
  fromCreatedDate?: string;
  toCreatedDate?: string;
}

export type ExportResult =
  | { ok: true; csvContent: string; count: number }
  | { ok: false; code: "forbidden" | "limit_exceeded"; error: string };

export const MAX_EXPORT_LIMIT = 5000;

/**
 * Sanitizes a cell against CSV Formula Injection (OWASP).
 * If cell starts with =, +, -, @, \t, \r, it prepends a single quote.
 * Wraps cell in double quotes and escapes existing quotes.
 */
export function sanitizeCsvCell(raw: string | number | boolean | null | undefined): string {
  if (raw === null || raw === undefined) return '""';
  let str = String(raw);

  // Strip formula triggers
  const trimmed = str.trimStart();
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    str = "'" + str;
  }

  // Escape double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Admin only: Exports contacts to CSV with formula injection defense and UTF-8 BOM.
 * Returns exactly one row per unique contact, aggregating multiple phone numbers / channel IDs.
 */
export async function exportContactsCsv(
  db: Db,
  filters: ContactExportFilter = {},
  actorRole: "admin" | "agent",
): Promise<ExportResult> {
  if (actorRole !== "admin") {
    return { ok: false, code: "forbidden", error: "শুধুমাত্র অ্যাডমিন কন্টাক্ট এক্সপোর্ট করতে পারেন।" };
  }

  const conditions = [];

  if (filters.stageId) {
    conditions.push(eq(schema.contacts.stageId, filters.stageId));
  }

  if (filters.optedIn !== undefined) {
    conditions.push(eq(schema.contacts.optedIn, filters.optedIn));
  }

  if (filters.fromCreatedDate) {
    conditions.push(sql`${schema.contacts.createdAt} >= ${new Date(filters.fromCreatedDate + "T00:00:00Z")}`);
  }

  if (filters.toCreatedDate) {
    conditions.push(sql`${schema.contacts.createdAt} <= ${new Date(filters.toCreatedDate + "T23:59:59.999Z")}`);
  }

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.contacts.name, term),
        ilike(schema.contacts.notes, term),
        ilike(schema.contactIdentities.externalId, term),
      ),
    );
  }

  const havingConditions = [];
  const fromContact = filters.fromLastContactDate || filters.fromDate;
  if (fromContact) {
    havingConditions.push(sql`max(${schema.conversations.lastCustomerMessageAt}) >= ${new Date(fromContact + "T00:00:00Z")}`);
  }

  const toContact = filters.toLastContactDate || filters.toDate;
  if (toContact) {
    havingConditions.push(sql`max(${schema.conversations.lastCustomerMessageAt}) <= ${new Date(toContact + "T23:59:59.999Z")}`);
  }

  const rows = await db
    .select({
      id: schema.contacts.id,
      name: schema.contacts.name,
      notes: schema.contacts.notes,
      optedIn: schema.contacts.optedIn,
      createdAt: schema.contacts.createdAt,
      stageName: schema.lifecycleStages.name,
      phoneOrIds: sql<string | null>`string_agg(DISTINCT ${schema.contactIdentities.externalId}, ', ')`,
      lastContactAt: sql<Date | null>`max(${schema.conversations.lastCustomerMessageAt})`,
    })
    .from(schema.contacts)
    .leftJoin(schema.lifecycleStages, eq(schema.lifecycleStages.id, schema.contacts.stageId))
    .leftJoin(schema.contactIdentities, eq(schema.contactIdentities.contactId, schema.contacts.id))
    .leftJoin(schema.conversations, eq(schema.conversations.contactId, schema.contacts.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(
      schema.contacts.id,
      schema.contacts.name,
      schema.contacts.notes,
      schema.contacts.optedIn,
      schema.contacts.createdAt,
      schema.lifecycleStages.name,
    )
    .having(havingConditions.length ? and(...havingConditions) : undefined)
    .orderBy(desc(schema.contacts.createdAt))
    .limit(MAX_EXPORT_LIMIT + 1);

  if (rows.length > MAX_EXPORT_LIMIT) {
    return {
      ok: false,
      code: "limit_exceeded",
      error: `একবারে সর্বোচ্চ ${MAX_EXPORT_LIMIT}টি কন্টাক্ট এক্সপোর্ট করা সম্ভব। ফিল্টার দিয়ে সংখ্যা কমিয়ে নিন।`,
    };
  }

  const headers = [
    "কন্টাক্ট আইডি",
    "নাম",
    "ফোন / আইডি",
    "লাইফসাইকেল স্টেজ",
    "ব্রডকাস্ট সম্মতি (Opted In)",
    "শেষ যোগাযোগের তারিখ",
    "নোট",
    "তৈরির তারিখ",
  ];

  const headerLine = headers.map(sanitizeCsvCell).join(",");
  const dataLines = rows.map((r) => {
    return [
      sanitizeCsvCell(r.id),
      sanitizeCsvCell(r.name || "অজানা"),
      sanitizeCsvCell(r.phoneOrIds || "নেই"),
      sanitizeCsvCell(r.stageName || "ডিফল্ট"),
      sanitizeCsvCell(r.optedIn ? "হ্যাঁ" : "না"),
      sanitizeCsvCell(r.lastContactAt ? new Date(r.lastContactAt).toISOString().slice(0, 10) : "যোগাযোগ হয়নি"),
      sanitizeCsvCell(r.notes || ""),
      sanitizeCsvCell(r.createdAt.toISOString().slice(0, 10)),
    ].join(",");
  });

  // UTF-8 BOM so Excel opens Bangla properly
  const csvContent = "\uFEFF" + [headerLine, ...dataLines].join("\r\n");

  return {
    ok: true,
    csvContent,
    count: rows.length,
  };
}
