import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { placeholderCount, templateBodyText } from "@/channels/whatsapp/templates";
import { requireRole } from "@/core/auth/dal";
import { eligibleRecipients } from "@/core/broadcast/engine";
import { db } from "@/db";
import { channels, tags, templates } from "@/db/schema";
import { NewBroadcastForm } from "./new-form";
import { buttonClass, fieldClass } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "New broadcast — Saimum CRM" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function NewBroadcastPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

const field = fieldClass;

async function Content({ searchParams }: { searchParams: SP }) {
  await requireRole("admin");
  const { t: tr } = await getT();
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const channelId = z.uuid().safeParse(one(raw.channelId));
  const templateId = z.uuid().safeParse(one(raw.templateId));
  const tagId = z.uuid().safeParse(one(raw.tagId));

  const wa = await db.select().from(channels).where(eq(channels.type, "whatsapp")).orderBy(asc(channels.createdAt));
  const chosen = wa.find((c) => channelId.success && c.id === channelId.data) ?? wa[0];
  const approved = chosen
    ? await db.select().from(templates).where(and(eq(templates.channelId, chosen.id), eq(templates.status, "approved"))).orderBy(asc(templates.name))
    : [];
  const template = approved.find((t) => templateId.success && t.id === templateId.data);
  const allTags = await db.select().from(tags).orderBy(asc(tags.name));
  const reach = chosen && template ? (await eligibleRecipients(db, chosen.id, tagId.success ? tagId.data : null)).length : null;
  const body = template ? templateBodyText(template.components) : "";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/broadcasts" className="text-sm underline">← Broadcast</Link>
      <h1 className="text-2xl font-bold tracking-tight">{tr("নতুন broadcast")}</h1>

      {wa.length === 0 ? (
        <p className="text-sm text-muted">{tr("কোনো WhatsApp চ্যানেল নেই।")}</p>
      ) : (
        <>
          <form action="/broadcasts/new" className="space-y-2">
            <label className="block text-sm">{tr("চ্যানেল বাছুন")}
              <select name="channelId" defaultValue={chosen?.id} className={`${field} mt-1`}>
                {wa.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isTest ? " (" + tr("টেস্ট") + ")" : ""}</option>)}
              </select>
            </label>
            <label className="block text-sm">{tr("অনুমোদিত টেমপ্লেট")}
              <select name="templateId" defaultValue={template?.id ?? ""} className={`${field} mt-1`}>
                <option value="">{tr("— বেছে নিন —")}</option>
                {approved.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
              </select>
            </label>
            <label className="block text-sm">{tr("শুধু এই ট্যাগের কন্টাক্ট (ঐচ্ছিক)")}
              <select name="tagId" defaultValue={tagId.success ? tagId.data : ""} className={`${field} mt-1`}>
                <option value="">{tr("সব সম্মতিপ্রাপ্ত")}</option>
                {allTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <button type="submit" className={buttonClass("secondary", "sm")}>{tr("পরের ধাপ")}</button>
            {approved.length === 0 && <p className="text-sm text-warning">{tr("এই চ্যানেলে কোনো approved টেমপ্লেট নেই। আগে টেমপ্লেট পাতা থেকে sync বা জমা দিন।")}</p>}
          </form>

          {template && chosen && reach !== null && (
            <NewBroadcastForm
              channelId={chosen.id}
              templateId={template.id}
              tagId={tagId.success ? tagId.data : ""}
              body={body}
              variables={placeholderCount(body)}
              reach={reach}
              realChannel={!chosen.isTest}
            />
          )}
        </>
      )}
    </main>
  );
}
