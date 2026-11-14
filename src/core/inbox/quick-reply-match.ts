// Pure helpers (no database imports) so the reply box in the browser can use them too.

export interface QuickReply {
  id: string;
  shortcut: string;
  body: string;
}

/** Replies whose shortcut starts with what was typed after "/" (empty query = all), for the menu. */
export function matchQuickReplies(all: QuickReply[], query: string, limit = 8): QuickReply[] {
  const s = query.trim().toLowerCase();
  const starts = all.filter((r) => r.shortcut.startsWith(s));
  const contains = all.filter((r) => !r.shortcut.startsWith(s) && (r.shortcut.includes(s) || r.body.toLowerCase().includes(s)));
  return [...starts, ...contains].slice(0, limit);
}

/** The text after a leading "/" when the box starts a quick-reply lookup ("/fee" -> "fee"); null otherwise (any whitespace ends the lookup). */
export function slashQuery(text: string): string | null {
  return text.startsWith("/") && !/\s/.test(text) ? text.slice(1) : null;
}
