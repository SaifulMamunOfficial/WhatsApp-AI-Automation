import Link from "next/link";
import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { requireRole } from "@/core/auth/dal";
import { db } from "@/db";
import { channels } from "@/db/schema";
import { ImportForm } from "./import-form";

export const metadata = { title: "CSV আমদানি — Saimum CRM" };

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">লোড হচ্ছে…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  const wa = await db.select({ id: channels.id, name: channels.name }).from(channels).where(eq(channels.type, "whatsapp")).orderBy(asc(channels.createdAt));

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <Link href="/contacts" className="text-sm underline">← কন্টাক্ট</Link>
      <h1 className="text-lg font-semibold">CSV থেকে কন্টাক্ট আমদানি</h1>
      <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        <p>প্রথম সারিতে কলামের নাম দিন: <code>name</code> (বা <code>নাম</code>), <code>phone</code> (বা <code>মোবাইল</code>), ঐচ্ছিক <code>tags</code> (বা <code>ট্যাগ</code>; একাধিক হলে <code>;</code> দিয়ে আলাদা)।</p>
        <p>নম্বর যেকোনো ভাবে লেখা চলবে: <code>01711-000001</code>, <code>+8801711000001</code>, <code>০১৭১১০০০০০১</code>। যার নাম আগে থেকে আছে, নাম বদলাবে না; শুধু ট্যাগ যোগ হবে। একবারে সর্বোচ্চ ৫০০০ সারি, ২ MB।</p>
        <p className="rounded bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          শুধু তাদেরই আমদানি করুন যারা প্রতিষ্ঠানের কাছ থেকে মেসেজ পেতে সম্মত (opt-in)। WhatsApp-এ broadcast পাঠাতে এটা বাধ্যতামূলক।
        </p>
      </div>
      {wa.length === 0 ? <p className="text-sm text-zinc-500">কোনো WhatsApp চ্যানেল নেই।</p> : <ImportForm channels={wa} />}
    </main>
  );
}
