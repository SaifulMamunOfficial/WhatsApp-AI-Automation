import { Suspense } from "react";
import { requireRole } from "@/core/auth/dal";
import { listQuickReplies } from "@/core/inbox/quick-replies";
import { db } from "@/db";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { AddQuickReplyForm, QuickReplyRow } from "./quick-reply-forms";

export const metadata = { title: "Quick replies — Saimum CRM" };

export default function QuickRepliesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  const { t, num } = await getT();
  const replies = await listQuickReplies(db);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title={t("দ্রুত উত্তর")}
        description={t("বারবার লাগে এমন উত্তর সংরক্ষণ করুন। ইনবক্সের উত্তরের ঘরে / লিখলেই এগুলোর তালিকা আসে; বেছে নিলে লেখাটা বসে যায়, পাঠানোর আগে বদলানো যায়।")}
      />
      <AddQuickReplyForm />
      <section className="space-y-2">
        <h2 className="text-base font-bold">{t("সংরক্ষিত উত্তর ({n}টি)", { n: num(replies.length) })}</h2>
        <Card className="overflow-hidden">
          {replies.length === 0 ? (
            <EmptyState title={t("এখনো কোনো দ্রুত উত্তর নেই।")} hint={t("উপরে প্রথমটা যোগ করুন, যেমন office বা fee।")} />
          ) : (
            <ul className="divide-y divide-border">
              {replies.map((r) => (
                <QuickReplyRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
