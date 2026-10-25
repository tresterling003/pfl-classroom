/**
 * Text normalization used by fill-in-the-blank and short-answer grading.
 * Goal: forgive capitalization, punctuation, spacing and tiny slips — but never
 * treat answers with a different meaning as equal.
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", hundred: "100", thousand: "1000",
};

const LEADING_FILLER = new Set(["the", "a", "an"]);

/** Lowercase, unify quotes/dashes/&, drop punctuation except inside numbers, collapse spaces. */
export function normalizeText(input: string): string {
  let s = (input ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[‘’‛′]/g, "'").replace(/[“”]/g, '"');
  s = s.replace(/[‐-―]/g, "-");
  s = s.replace(/&/g, " and ");
  // Keep decimal points and thousands separators that sit between digits; drop "$" and "," etc.
  s = s.replace(/(\d),(?=\d{3}\b)/g, "$1");
  s = s.replace(/(\d)\.(?=\d)/g, "$1\u0000");
  s = s.replace(/'s\b/g, ""); // possessives: "business's" → "business"
  s = s.replace(/[^a-z0-9\u0000\s]/g, " ");
  s = s.replace(/\u0000/g, ".");
  return s.replace(/\s+/g, " ").trim();
}

/** Very small English stemmer — only strips endings that don't change meaning for our purposes. */
export function stem(word: string): string {
  let w = word;
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("sses")) return w.slice(0, -2);
  if (w.endsWith("es") && /(ch|sh|x|ss|z)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) w = w.slice(0, -1);
  return w;
}

/** Normalized tokens for comparison: numbers words → digits, leading articles removed, plurals folded. */
export function canonicalTokens(input: string): string[] {
  const tokens = normalizeText(input)
    .split(" ")
    .filter(Boolean)
    .map((t) => NUMBER_WORDS[t] ?? t);
  while (tokens.length > 1 && LEADING_FILLER.has(tokens[0])) tokens.shift();
  return tokens.map(stem);
}

export function canonical(input: string): string {
  return canonicalTokens(input).join(" ");
}

/** Levenshtein distance with early exit when it exceeds `max`. */
export function editDistance(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How many spelling slips we forgive for a word of this length. */
export function typoAllowance(word: string): number {
  if (/\d/.test(word)) return 0; // never fuzz numbers
  if (word.length >= 10) return 2;
  if (word.length >= 5) return 1;
  return 0;
}

/**
 * Word pairs that are one or two letters apart but mean opposite/different things.
 * Typo tolerance is never applied between these.
 */
const CONFUSABLE_PAIRS: [string, string][] = [
  ["increase", "decrease"], ["increas", "decreas"], ["upward", "downward"], ["rise", "rose"],
  ["supply", "supple"], ["more", "mor"], ["price", "prize"], ["lower", "lowe"], ["higher", "high"],
  ["input", "output"], ["import", "export"], ["good", "food"], ["cost", "cast"],
];

export function areConfusable(a: string, b: string): boolean {
  return CONFUSABLE_PAIRS.some(([x, y]) => (a.startsWith(x) && b.startsWith(y)) || (a.startsWith(y) && b.startsWith(x)));
}

/** Token-by-token comparison that allows small spelling slips on longer words. */
export function tokensMatchWithTypos(a: string[], b: string[]): { match: boolean; typos: number } {
  if (a.length !== b.length) return { match: false, typos: 0 };
  let typos = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const allowance = Math.min(typoAllowance(a[i]), typoAllowance(b[i]));
    if (allowance === 0 || areConfusable(a[i], b[i])) return { match: false, typos };
    const d = editDistance(a[i], b[i], allowance);
    if (d > allowance) return { match: false, typos };
    typos += d;
  }
  return { match: true, typos };
}

/** Extract a single number from an answer like "$400", "400 sandwiches", "four hundred" is not parsed. */
export function extractNumber(input: string): number | null {
  const s = normalizeText(input);
  const m = s.match(/-?\d+(\.\d+)?/g);
  if (!m || m.length !== 1) return null;
  return Number(m[0]);
}

export function wordCount(input: string): number {
  return normalizeText(input).split(" ").filter(Boolean).length;
}
