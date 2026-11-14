import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/core/auth/dal";
import { localDate } from "@/core/automation/holiday-rules";
import { listHolidays } from "@/core/automation/holidays";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import { Alert, Card, EmptyState, PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { AddHolidayForm, HolidayRow, type HolidayView } from "./holiday-forms";

export const metadata = { title: "Holidays — Saimum CRM" };

export default function HolidaysPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await requireRole("admin");
  await connection();
  const { t, num, intl } = await getT();
  const tz = officeHoursFromEnv().tz;
  const today = localDate(new Date(), tz);
  const fmt = new Intl.DateTimeFormat(intl, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const show = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));

  const rows = await listHolidays(db);
  const views: HolidayView[] = rows.map((r) => ({
    ...r,
    phase: r.endDate < today ? "past" : r.startDate <= today ? "active" : "upcoming",
    range: r.startDate === r.endDate ? show(r.startDate) : `${show(r.startDate)} – ${show(r.endDate)}`,
  }));
  const current = views.find((v) => v.phase === "active" && v.enabled);
  // Upcoming first (soonest first), then the past (latest first).
  const ordered = [...views.filter((v) => v.phase !== "past"), ...views.filter((v) => v.phase === "past").reverse()];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader
        title={t("ছুটির দিন")}
        description={t("ছুটির দিনে অফিস বন্ধ বলে bot গ্রাহককে এই বার্তা পাঠায় (১২ ঘণ্টায় একবার), স্বাগত বা অফিস-সময়ের বার্তার বদলে। keyword ও AI-র উত্তর আগের মতোই চলে। তারিখ {tz} সময় অনুযায়ী।", { tz })}
      />
      {current && <Alert tone="warning">{t("এখন ছুটি চলছে: {name}। গ্রাহকরা ছুটির বার্তা পাচ্ছেন (bot চালু থাকলে)।", { name: current.name })}</Alert>}
      <AddHolidayForm />
      <section className="space-y-2">
        <h2 className="text-base font-bold">{t("সব ছুটি ({n}টি)", { n: num(views.length) })}</h2>
        <Card className="overflow-hidden">
          {ordered.length === 0 ? (
            <EmptyState title={t("এখনো কোনো ছুটি নেই।")} hint={t("উপরে প্রথমটা যোগ করুন, যেমন ঈদের ছুটি।")} />
          ) : (
            <ul className="divide-y divide-border">
              {ordered.map((h) => (
                <HolidayRow key={h.id} h={h} />
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
