import { Suspense } from "react";
import { requireRole } from "@/core/auth/dal";
import { listQuickReplies } from "@/core/inbox/quick-replies";
import { db } from "@/db";
import { PageHeader, PageShell } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { QuickRepliesView } from "./quick-replies-view";

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
  const { t } = await getT();
  const replies = await listQuickReplies(db);

  return (
    <PageShell>
      <PageHeader
        title={t("দ্রুত উত্তর")}
        description={t("বারবার লাগে এমন উত্তর সংরক্ষণ করুন। ইনবক্সের উত্তরের ঘরে / লিখলেই এগুলোর তালিকা আসে; বেছে নিলে লেখাটা বসে যায়, পাঠানোর আগে বদলানো যায়।")}
      />
      <QuickRepliesView replies={replies} />
    </PageShell>
  );
}
