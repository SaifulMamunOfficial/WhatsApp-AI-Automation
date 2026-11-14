"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "./index";

/** Remembers the chosen language for a year. Not a secret, so the cookie is readable by scripts too. */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
