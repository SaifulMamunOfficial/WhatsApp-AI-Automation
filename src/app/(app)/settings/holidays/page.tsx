import { Suspense } from "react";
import { connection } from "next/server";
import { requireRole } from "@/core/auth/dal";
import { daysBetween, localDate } from "@/core/automation/holiday-rules";
import { listHolidays } from "@/core/automation/holidays";
import { officeHoursFromEnv } from "@/core/automation/office-hours";
import { db } from "@/db";
import { PageHeader, PageShell } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { HolidaysView, type HolidayView } from "./holidays-view";

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
  const { t, intl } = await getT();
  const tz = officeHoursFromEnv().tz;
  const today = localDate(new Date(), tz);
  const fmt = new Intl.DateTimeFormat(intl, { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
  const show = (d: string) => fmt.format(new Date(`${d}T00:00:00Z`));

  const rows = await listHolidays(db);
  const views: HolidayView[] = rows.map((r) => ({
    ...r,
    phase: r.endDate < today ? "past" : r.startDate <= today ? "active" : "upcoming",
    range: r.startDate === r.endDate ? show(r.startDate) : `${show(r.startDate)} – ${show(r.endDate)}`,
    days: daysBetween(r.startDate, r.endDate) + 1,
  }));
  // Current and upcoming first (soonest first), then the past (latest first).
  const ordered = [...views.filter((v) => v.phase !== "past"), ...views.filter((v) => v.phase === "past").reverse()];

  return (
    <PageShell>
      <PageHeader
        title={t("ছুটির দিন")}
        description={t("ছুটির দিনে অফিস বন্ধ বলে bot গ্রাহককে এই বার্তা পাঠায় (১২ ঘণ্টায় একবার), স্বাগত বা অফিস-সময়ের বার্তার বদলে। keyword ও AI-র উত্তর আগের মতোই চলে। তারিখ {tz} সময় অনুযায়ী।", { tz })}
      />
      <HolidaysView holidays={ordered} />
    </PageShell>
  );
}
