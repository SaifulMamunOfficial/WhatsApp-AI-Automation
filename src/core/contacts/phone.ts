const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * Normalizes a phone number to WhatsApp's format: digits only, country code, no "+".
 * Bangladesh is the default, since that is where the customers are:
 *   01711-000000 / ০১৭১১০০০০০০ / +880 1711 000000 / 8801711000000  ->  8801711000000
 * Other international numbers are accepted if they look plausible (8-15 digits).
 * Returns null when the input cannot be a phone number.
 */
export function normalizePhone(input: string): string | null {
  let d = input
    .replace(/[০-৯]/g, (c) => String(BN_DIGITS.indexOf(c)))
    .replace(/[^\d]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);

  // Bangladesh mobile numbers: 01XXXXXXXXX (11 digits) or 1XXXXXXXXX (10 digits, leading 0 dropped).
  if (/^01[3-9]\d{8}$/.test(d)) return `880${d.slice(1)}`;
  if (/^1[3-9]\d{8}$/.test(d)) return `880${d}`;
  if (/^8801[3-9]\d{8}$/.test(d)) return d;

  // Anything else must at least be a plausible international number.
  if (d.startsWith("0")) return null; // a local number of unknown country
  return d.length >= 8 && d.length <= 15 ? d : null;
}
