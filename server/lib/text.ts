// Text normalisation + similarity used by same-day chaining.

// Small English stopword list: enough to stop "the/and/of" dominating shingle overlap.
export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a an and are as at be been being but by did do does doing for from had has have having he her " +
    "here hers him his how i if in into is it its itself just me more most my no nor not of off on once " +
    "only or other our ours out over own same she so some such than that the their theirs them then there " +
    "these they this those through to too under until up very was we were what when where which while who " +
    "whom why will with you your yours also again all any both each few further about above after against " +
    "before below between during can should would could"
  ).split(" "),
);

/** Lowercase word tokens, punctuation stripped, stopwords removed. Keeps digits ("K12", "v2"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/['’]/g, "") // "didn't" -> "didnt"
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * Word bigram shingles ("fixed bug", "bug login"). Texts with a single
 * meaningful word fall back to that unigram so they can still match.
 */
export function shingles(text: string): Set<string> {
  const words = tokenize(text);
  if (words.length === 1) return new Set(words);
  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) out.add(`${words[i]} ${words[i + 1]}`);
  return out;
}

/** |A ∩ B| / |A ∪ B|. Two empty sets score 0 (nothing to relate on). */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function similarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b));
}
