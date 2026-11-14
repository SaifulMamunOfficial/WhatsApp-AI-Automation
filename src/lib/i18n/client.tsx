"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DEFAULT_LOCALE, intlLocale, numberFormat, translate, type Locale, type TFn } from "./index";

interface Ctx {
  locale: Locale;
  t: TFn;
  num: (n: number) => string;
  intl: string;
}

const I18nContext = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  t: (k, v) => translate(DEFAULT_LOCALE, k, v),
  num: (n) => String(n),
  intl: intlLocale(DEFAULT_LOCALE),
});

/** Gives client components the language chosen on the server (read from the cookie there). */
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<Ctx>(() => {
    const nf = numberFormat(locale);
    return { locale, t: (k, v) => translate(locale, k, v), num: (n) => nf.format(n), intl: intlLocale(locale) };
  }, [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
