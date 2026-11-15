import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/core/auth/dal";
import { listLifecycleStages } from "@/core/contacts/stages";
import { db } from "@/db";
import { PageHeader, PageShell } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { StagesView } from "./stages-view";

export const metadata = { title: "Lifecycle Stages — Saimum CRM" };

export default function StagesPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  await connection();
  const { t } = await getT();

  const stages = await listLifecycleStages(db);

  return (
    <PageShell>
      <PageHeader
        title={t("লাইফসাইকেল স্টেজ")}
        description={t("গ্রাহকদের রূপান্তর প্রক্রিয়ার ধাপগুলো (যেমন: New Lead, Interested, Customer) পরিচালনা করুন। ইনবক্স ও কন্টাক্ট তালিকায় এটি রঙিন ব্যাজ হিসেবে প্রদর্শিত হবে।")}
      />
      <StagesView stages={stages} />
    </PageShell>
  );
}
