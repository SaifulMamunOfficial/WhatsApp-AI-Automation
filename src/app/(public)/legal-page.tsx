import { Suspense } from "react";
import Link from "next/link";
import { LanguageIconButton } from "@/components/language-switch";
import { ThemeIconButton } from "@/components/theme-switch";
import { LogoMark } from "@/components/ui";
import { I18nProvider } from "@/lib/i18n/client";
import { getT } from "@/lib/i18n/server";
import { LEGAL, LEGAL_UPDATED, type LegalDoc } from "./legal-content";

// The address people write to. Set PUBLIC_CONTACT_EMAIL in .env to change it.
const CONTACT_EMAIL = process.env.PUBLIC_CONTACT_EMAIL || "saimumoffice@gmail.com";

const LINKS: { doc: LegalDoc; href: string; label: string }[] = [
  { doc: "privacy", href: "/privacy", label: "গোপনীয়তা নীতি" },
  { doc: "terms", href: "/terms", label: "সেবার শর্তাবলী" },
  { doc: "data-deletion", href: "/data-deletion", label: "তথ্য মোছার নির্দেশনা" },
];

/** Public, no-login page. The language comes from the cookie, so it sits behind <Suspense>. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm">…</p>}>
      <Content doc={doc} />
    </Suspense>
  );
}

async function Content({ doc }: { doc: LegalDoc }) {
  const { locale, t, intl } = await getT();
  const c = LEGAL[doc];
  const updated = new Intl.DateTimeFormat(intl, { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${LEGAL_UPDATED}T12:00:00+06:00`));

  return (
    <I18nProvider locale={locale}>
      <div className="min-h-dvh bg-bg">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex h-16 max-w-3xl items-center gap-2 px-4 sm:px-6">
            <LogoMark />
            <span className="text-[17px] font-bold tracking-tight">Saimum CRM</span>
            <span className="ml-auto flex items-center">
              <LanguageIconButton />
              <ThemeIconButton />
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">{t(c.title)}</h1>
            <p className="text-sm text-muted">{t("সর্বশেষ হালনাগাদ: {date}", { date: updated })}</p>
            <p className="text-[17px]">{t(c.intro)}</p>
          </div>

          {c.sections.map((s) => (
            <section key={s.title} className="space-y-2">
              <h2 className="text-xl font-bold">{t(s.title)}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p}>{t(p)}</p>
              ))}
              {s.items && (
                <ul className="list-disc space-y-1.5 pl-6">
                  {s.items.map((i) => (
                    <li key={i}>{t(i)}</li>
                  ))}
                </ul>
              )}
              {(s.title === "যোগাযোগ") && (
                <p>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand underline-offset-2 hover:underline">{CONTACT_EMAIL}</a>
                </p>
              )}
            </section>
          ))}

          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-6 text-sm">
            {LINKS.filter((l) => l.doc !== doc).map((l) => (
              <Link key={l.doc} href={l.href} className="font-semibold text-brand hover:underline">{t(l.label)}</Link>
            ))}
          </nav>
          <p className="text-xs text-muted">Saimum Shilpigosthi · {t("ঢাকা, বাংলাদেশ")}</p>
        </main>
      </div>
    </I18nProvider>
  );
}
