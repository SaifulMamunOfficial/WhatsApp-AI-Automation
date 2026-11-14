import { EN } from "./en";

// Two UI languages: English (default) and Bangla. Source strings in the code are Bangla;
// the English dictionary (./en) is keyed by that Bangla text, gettext-style.
//
//  - UI text:      t("ইনবক্স")                      -> "Inbox" in English, unchanged in Bangla
//  - with values:  t("{n}টি খোলা", { n: 5 })       -> "5 open"
//  - core messages (error strings built in src/core, may already contain numbers):
//                  t("নাম সর্বোচ্চ 200 অক্ষর।")      -> matched against dictionary patterns such as
//                  "নাম সর্বোচ্চ {0} অক্ষর।" and translated, so the core stays language-free.
// Anything without an English entry falls back to the Bangla source text (never blank).

export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "lang";

export type Vars = Record<string, string | number>;

export function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "bn";
}

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text);

interface Pattern {
  re: RegExp;
  names: string[];
  value: string;
}
let patterns: Pattern[] | null = null;

function buildPatterns(): Pattern[] {
  const list: Pattern[] = [];
  for (const [key, value] of Object.entries(EN)) {
    if (!/\{\w+\}/.test(key)) continue;
    // A key that is almost all placeholder ("{n}টি") would match ANY text ending in those letters
    // (e.g. "ছুটি" -> "ছু"). Such keys are only used with explicit values, never for pattern matching.
    if (key.replace(/\{\w+\}/g, "").trim().length < 4) continue;
    const names: string[] = [];
    const source = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (m) {
          names.push(m[1]);
          return "([\\s\\S]+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    list.push({ re: new RegExp(`^${source}$`), names, value });
  }
  // Longer (more specific) patterns first.
  return list.sort((a, b) => b.re.source.length - a.re.source.length);
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  if (locale === "bn") return fill(key, vars);
  const hit = EN[key];
  if (hit !== undefined) return fill(hit, vars);
  if (!vars) {
    patterns ??= buildPatterns();
    for (const p of patterns) {
      const m = p.re.exec(key);
      if (m) return fill(p.value, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])));
    }
  }
  return fill(key, vars);
}

export type TFn = (key: string, vars?: Vars) => string;

/** Number / date helpers for the chosen language (Bangla digits only in Bangla). */
export function numberFormat(locale: Locale): Intl.NumberFormat {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US");
}
export const intlLocale = (locale: Locale) => (locale === "bn" ? "bn-BD" : "en-GB");
