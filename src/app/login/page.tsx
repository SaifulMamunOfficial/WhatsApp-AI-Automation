import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Inbox, Megaphone, MessagesSquare, ShieldCheck } from "lucide-react";
import { LanguageIconButton } from "@/components/language-switch";
import { ThemeIconButton } from "@/components/theme-switch";
import { getCurrentUser } from "@/core/auth/session";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in — Saimum CRM" };

// Already signed in with a valid session: go to the app.
async function RedirectIfSignedIn() {
  if (await getCurrentUser()) redirect("/");
  return null;
}

const POINTS = [
  { icon: Inbox, text: "WhatsApp ও Messenger-এর সব মেসেজ একটাই ইনবক্সে" },
  { icon: Megaphone, text: "অটো-রিপ্লাই, AI সহকারী ও অনুমোদিত broadcast" },
  { icon: ShieldCheck, text: "আপনার গ্রাহকের তথ্য আপনারই সার্ভারে, এনক্রিপ্টেড" },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

async function LoginContent() {
  const { locale, t } = await getT();
  return (
    <I18nProvider locale={locale}>
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>

      {/* brand panel: full height on large screens, a compact header on small ones */}
      <section className="relative flex flex-col justify-between gap-10 overflow-hidden px-6 py-8 text-brand-fg [background-image:var(--brand-grad)] sm:px-10 lg:px-14 lg:py-14">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
            <MessagesSquare aria-hidden className="size-6" strokeWidth={2.2} />
          </span>
          <span className="text-xl font-bold tracking-tight">Saimum CRM</span>
        </div>
        <div className="relative hidden space-y-8 lg:block">
          <h1 className="max-w-md text-4xl leading-tight font-bold tracking-tight">{t("গ্রাহকের প্রতিটা মেসেজ, এক জায়গা থেকে।")}</h1>
          <ul className="space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[17px]">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
                  <Icon aria-hidden className="size-5" />
                </span>
                {t(text)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative hidden text-sm opacity-80 lg:block">{t("Saimum Shilpigosthi · কর্মীদের জন্য")}</p>
      </section>

      <section className="relative flex items-center justify-center bg-bg px-5 py-10 sm:px-10">
        <div className="absolute top-3 right-3 flex lg:top-5 lg:right-5">
          <LanguageIconButton />
          <ThemeIconButton />
        </div>
        <div className="w-full max-w-sm space-y-7">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{t("স্বাগতম")}</h2>
            <p className="text-[15px] text-muted">{t("কাজ শুরু করতে আপনার অ্যাকাউন্টে লগইন করুন।")}</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
    </I18nProvider>
  );
}

