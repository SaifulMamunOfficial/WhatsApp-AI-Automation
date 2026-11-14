import { Suspense } from "react";
import { requireUserAllowingPasswordChange } from "@/core/auth/dal";
import { PageHeader } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { NameForm, PasswordForm } from "./profile-forms";

export const metadata = { title: "Profile — Saimum CRM" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm">…</p>}>
      <Content />
    </Suspense>
  );
}

// Every signed-in person can open this page. It is also where a temporary password is replaced,
// so it must work even while a password change is still pending.
async function Content() {
  const user = await requireUserAllowingPasswordChange();
  const { t } = await getT();
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <PageHeader title={t("আমার প্রোফাইল")} description={user.role === "admin" ? t("অ্যাডমিন") : t("এজেন্ট")} />
      <PasswordForm forced={user.mustChangePassword} />
      {!user.mustChangePassword && <NameForm name={user.name} email={user.email} />}
    </div>
  );
}
