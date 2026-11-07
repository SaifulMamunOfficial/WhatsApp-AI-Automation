/**
 * Development seed: two TEST channels (WhatsApp + Messenger) with sample conversations,
 * so the inbox has something to show before Meta is connected.
 * Never run against a database that holds real channels. It refuses if any non-test
 * channel exists.
 *
 *   npx tsx scripts/seed-dev.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/db";
import * as schema from "../src/db/schema";
import { ingestEvents } from "../src/core/inbox/ingest";
import { encryptSecret } from "../src/lib/crypto";
import type { NormalizedMessage } from "../src/channels/types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function main() {
  const real = await db.select({ id: schema.channels.id }).from(schema.channels).where(eq(schema.channels.isTest, false));
  if (real.length) {
    console.error("Refusing to seed: this database has non-test channels.");
    process.exit(1);
  }

  const upsert = async (values: typeof schema.channels.$inferInsert) => {
    await db
      .insert(schema.channels)
      .values(values)
      .onConflictDoNothing({ target: [schema.channels.type, schema.channels.externalId] });
  };
  // The token is fake: sending from the inbox will fail at Meta until a real test token is stored.
  const fakeToken = encryptSecret("dev-fake-token");
  await upsert({ type: "whatsapp", name: "WhatsApp টেস্ট নম্বর", externalId: "DEV_PNID", status: "active", accessTokenEncrypted: fakeToken, isTest: true });
  await upsert({ type: "messenger", name: "Messenger টেস্ট পেজ", externalId: "DEV_PAGE", status: "active", accessTokenEncrypted: fakeToken, isTest: true });

  const wa = (n: number, contact: string, name: string | undefined, text: string, mins: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    channelType: "whatsapp",
    channelExternalId: "DEV_PNID",
    externalId: `dev.wa.${contact}.${n}`,
    contactExternalId: contact,
    contactName: name,
    direction: "inbound",
    source: "api",
    type: "text",
    text,
    timestamp: minutesAgo(mins),
    ...extra,
  });
  const fb = (n: number, psid: string, text: string, mins: number, extra: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
    channelType: "messenger",
    channelExternalId: "DEV_PAGE",
    externalId: `dev.fb.${psid}.${n}`,
    contactExternalId: psid,
    direction: "inbound",
    source: "api",
    type: "text",
    text,
    timestamp: minutesAgo(mins),
    ...extra,
  });

  const result = await ingestEvents(db, {
    statuses: [],
    messages: [
      wa(1, "8801711000001", "রহিম উদ্দিন", "আসসালামু আলাইকুম, আপনাদের কোর্সের ফি কত?", 42),
      wa(2, "8801711000001", undefined, "ওয়ালাইকুম আসসালাম, কোন কোর্সের কথা বলছেন?", 40, { direction: "outbound", source: "phone_app", externalId: "dev.wa.8801711000001.echo1" }),
      wa(3, "8801711000001", "রহিম উদ্দিন", "ইলেকট্রিক্যাল ডিপ্লোমা", 5),
      wa(1, "8801822000002", "করিম", "আমি একটা ছবি পাঠালাম", 90, { type: "image", text: "এটা আমার সার্টিফিকেট" }),
      wa(1, "8801933000003", "সুমাইয়া", "ভর্তির শেষ তারিখ কবে?", 60 * 30), // 30 hours ago: outside the 24h window
      fb(1, "PSID_DEV_1", "হ্যালো, অফিস কখন খোলা থাকে?", 15),
      fb(2, "PSID_DEV_1", "রবিবারে কি খোলা?", 14),
      fb(1, "PSID_DEV_2", "ধন্যবাদ", 60 * 50), // 50 hours ago: HUMAN_AGENT window on Messenger
    ],
  });
  console.log("Seeded:", result);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
