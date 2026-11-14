import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, intlLocale, isLocale, numberFormat, translate, type Locale, type TFn } from "./index";

/** Reads the language cookie. Needs a request, so call it inside a <Suspense> boundary. */
export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT(): Promise<{ locale: Locale; t: TFn; num: (n: number) => string; intl: string }> {
  const locale = await getLocale();
  const nf = numberFormat(locale);
  return { locale, t: (key, vars) => translate(locale, key, vars), num: (n) => nf.format(n), intl: intlLocale(locale) };
}
