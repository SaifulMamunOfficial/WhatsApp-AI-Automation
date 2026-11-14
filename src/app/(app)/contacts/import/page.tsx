import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { getT } from "@/lib/i18n/server";
import { channels } from "@/db/schema";
import { ImportForm } from "./import-form";

export const metadata = { title: "CSV import — Saimum CRM" };

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  const { t } = await getT();
  const wa = await db.select({ id: channels.id, name: channels.name }).from(channels).where(eq(channels.type, "whatsapp")).orderBy(asc(channels.createdAt));

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/contacts" className="text-sm underline">{t("← কন্টাক্ট")}</Link>
      <h1 className="text-2xl font-bold tracking-tight">{t("CSV থেকে কন্টাক্ট আমদানি")}</h1>
      <div className="space-y-1 text-sm text-muted">
        <p>{t("প্রথম সারিতে কলামের নাম দিন: name (বা নাম), phone (বা মোবাইল), ঐচ্ছিক tags (বা ট্যাগ; একাধিক হলে ; দিয়ে আলাদা)।")}</p>
        <p>{t("নম্বর যেকোনো ভাবে লেখা চলবে: 01711-000001, +8801711000001, ০১৭১১০০০০০১। যার নাম আগে থেকে আছে, নাম বদলাবে না; শুধু ট্যাগ যোগ হবে। একবারে সর্বোচ্চ ৫০০০ সারি, ২ MB।")}</p>
        <p className="rounded bg-warning-soft px-3 py-2 text-fg">
          {t("শুধু তাদেরই আমদানি করুন যারা প্রতিষ্ঠানের কাছ থেকে মেসেজ পেতে সম্মত (opt-in)। WhatsApp-এ broadcast পাঠাতে এটা বাধ্যতামূলক।")}
        </p>
      </div>
      {wa.length === 0 ? <p className="text-sm text-muted">{t("কোনো WhatsApp চ্যানেল নেই।")}</p> : <ImportForm channels={wa} />}
    </main>
  );
}
