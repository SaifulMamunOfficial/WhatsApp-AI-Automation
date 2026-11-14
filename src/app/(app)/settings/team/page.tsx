import { Suspense } from "react";
import { requireRole } from "@/core/auth/dal";
import { listTeam } from "@/core/auth/team";
import { db } from "@/db";
import { PageHeader } from "@/components/ui";
import { formatFull } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { TeamView, type MemberView } from "./team-view";

export const metadata = { title: "Team — Saimum CRM" };

export default function TeamPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const me = await requireRole("admin");
  const { t, intl } = await getT();
  const team = await listTeam(db);
  const date = new Intl.DateTimeFormat(intl, { timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric" });
  const members: MemberView[] = team.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    active: m.active,
    mustChangePassword: m.mustChangePassword,
    lastLogin: m.lastLoginAt ? formatFull(m.lastLoginAt, intl) : t("এখনো নয়"),
    joined: date.format(m.createdAt),
    isMe: m.id === me.id,
  }));

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("টিম ও ব্যবহারকারী")} description={t("অ্যাডমিন ও এজেন্টদের অ্যাকাউন্ট এখান থেকে চালান।")} />
      <TeamView members={members} />
    </div>
  );
}
