// The taka sign (code point 2547), built from its number so it is not mistaken for Bangla text in the code.
const TAKA = String.fromCodePoint(0x9f3);

/** A taka amount from an already-formatted number string: the taka sign, a space, then the number. */
export function taka(formatted: string): string {
  return `${TAKA} ${formatted}`;
}
