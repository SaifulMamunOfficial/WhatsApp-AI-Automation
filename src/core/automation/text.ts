const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Normalizes customer text for keyword matching: lowercase, Bengali digits -> ASCII,
 * punctuation removed, whitespace collapsed. So "১", "1", " 1। " and "মূল্য?" all behave
 * the way a person expects.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    // keep letters (any script), combining marks (Bengali vowel signs), digits and spaces
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type MatchMode = "contains" | "exact";

export function matchesKeyword(text: string, keywords: string[], mode: MatchMode): boolean {
  const t = normalizeText(text);
  if (!t) return false;
  return keywords.some((k) => {
    const n = normalizeText(k);
    if (!n) return false;
    if (mode === "exact") return t === n;
    // Whole-word/phrase containment, so keyword "1" does not match "150 টাকা".
    return ` ${t} `.includes(` ${n} `);
  });
}
