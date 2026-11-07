import { normalizeText } from "@/core/automation/text";

export interface Article {
  id: string;
  title: string;
  content: string;
}

export interface RetrieveOptions {
  /** Character budget for the passages sent to the model. */
  maxChars?: number;
  maxArticles?: number;
}

/**
 * Word-level character trigrams. Bengali words take many suffixes (দাম, দামে, দামটা), and
 * trigram overlap still matches them, without a vector database or language-specific stemmer.
 */
function grams(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalizeText(text).split(" ")) {
    if (!word) continue;
    if (word.length < 3) out.add(word);
    else for (let i = 0; i <= word.length - 3; i++) out.add(word.slice(i, i + 3));
  }
  return out;
}

function coverage(query: Set<string>, doc: Set<string>): number {
  if (query.size === 0) return 0;
  let hit = 0;
  for (const g of query) if (doc.has(g)) hit++;
  return hit / query.size;
}

/**
 * Picks the knowledge-base articles most relevant to the customer's message(s).
 * A small knowledge base fits entirely in the budget, so everything is sent (best answers);
 * a larger one is ranked and cut to the budget. Titles count double.
 */
export function retrieveArticles(query: string, articles: Article[], opts: RetrieveOptions = {}): Article[] {
  const maxChars = opts.maxChars ?? 6000;
  const maxArticles = opts.maxArticles ?? 8;
  const size = (a: Article) => a.title.length + a.content.length;

  const q = grams(query);
  const ranked = articles
    .map((a) => ({ a, score: 2 * coverage(q, grams(a.title)) + coverage(q, grams(a.content)) }))
    .sort((x, y) => y.score - x.score);

  const total = articles.reduce((n, a) => n + size(a), 0);
  const pool = total <= maxChars ? ranked : ranked.filter((r) => r.score > 0.08);

  const picked: Article[] = [];
  let used = 0;
  for (const { a } of pool) {
    if (picked.length >= maxArticles || used >= maxChars) break;
    const room = maxChars - used;
    picked.push(size(a) <= room ? a : { ...a, content: a.content.slice(0, Math.max(0, room - a.title.length)) });
    used += Math.min(size(a), room);
  }
  return picked;
}
