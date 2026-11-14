import { Suspense } from "react";
import { requireRole } from "@/core/auth/dal";
import { listTeam } from "@/core/auth/team";
import { db } from "@/db";
import { Card, PageHeader } from "@/components/ui";
import { formatFull } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { AddMemberForm, MemberRow, type MemberView } from "./team-forms";

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
  const { t, num, intl } = await getT();
  const team = await listTeam(db);
  const members: MemberView[] = team.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role,
    active: m.active,
    mustChangePassword: m.mustChangePassword,
    lastLogin: m.lastLoginAt ? formatFull(m.lastLoginAt, intl) : t("এখনো নয়"),
    isMe: m.id === me.id,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("টিম ও ব্যবহারকারী")} description={t("{n} জন সদস্য। এখান থেকে অ্যাডমিন ও এজেন্টদের অ্যাকাউন্ট চালান।", { n: num(members.length) })} />
      <AddMemberForm />
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <MemberRow key={m.id} m={m} />
          ))}
        </ul>
      </Card>
      <p className="text-sm text-muted">
        {t("নতুন বা রিসেট করা অ্যাকাউন্টে সাময়িক পাসওয়ার্ড থাকে; প্রথম লগইনেই সদস্য নিজের পাসওয়ার্ড বানান। বন্ধ করলে বা পাসওয়ার্ড রিসেট করলে তিনি সব জায়গা থেকে লগআউট হয়ে যান। শেষ অ্যাডমিনকে বন্ধ বা এজেন্ট করা যায় না।")}
      </p>
    </div>
  );
}
