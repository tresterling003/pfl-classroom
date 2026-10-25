/**
 * Rubric-based short-answer grader (works with no AI configured).
 *
 * It looks for each rubric idea, expressed any of the ways the teacher listed, and gives
 * partial credit per idea. It is deliberately humble: every score it produces is marked
 * PROVISIONAL, and anything it is unsure about is flagged for teacher review.
 */
import type { CriterionResult, GradeDetail, ShortAnswerData } from "../types";
import { areConfusable, editDistance, normalizeText, stem, wordCount } from "./normalize";

const STOPWORDS = new Set(
  "a an the of to and or is are be been being it its in on at for by with as that this these those there their they them then than so do does did can will would should could has have had was were from into about which who what when where why how".split(" "),
);
const NEGATORS = new Set(["not", "no", "never", "isnt", "doesnt", "dont", "arent", "wont", "cant", "without", "neither", "nor"]);

/** Looser stem for free writing: increase / increases / increasing / increased → "increas". */
const IRREGULAR: Record<string, string> = {
  goes: "go", went: "go", gone: "go", bought: "buy", sold: "sell", made: "make", rose: "rise", risen: "rise",
  fell: "fall", fallen: "fall", paid: "pay", got: "get", gets: "get", gave: "give", ran: "run", cheaper: "cheap",
};

export function looseStem(word: string): string {
  let w = IRREGULAR[word] ?? stem(word);
  for (const suf of ["ing", "ers", "ed", "er", "est"]) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      w = w.slice(0, -suf.length);
      break;
    }
  }
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("y")) w = w.slice(0, -1) + "i";
  return w;
}

/** Sentence boundary marker kept in the token stream. */
const SB = "§";

function tokenize(text: string): string[] {
  // join contractions so "doesn't" → "doesnt"
  const words = (t: string) => normalizeText(t.replace(/n['’]t\b/gi, "nt")).split(" ").filter(Boolean);
  const out: string[] = [];
  for (const sentence of (text ?? "").split(/(?<=[.!?;])\s+|\n+/)) {
    const w = words(sentence);
    if (!w.length) continue;
    if (out.length) out.push(SB);
    out.push(...w);
  }
  return out;
}

function importantTokens(phrase: string): string[] {
  const toks = tokenize(phrase);
  const imp = toks.filter((t) => !STOPWORDS.has(t));
  return (imp.length ? imp : toks).map(looseStem);
}

/**
 * Free writing has many short look-alike words (stuff/staff, tools/pools), so typo
 * tolerance here only applies to longer words.
 */
function rubricTypoAllowance(w: string): number {
  if (/\d/.test(w)) return 0;
  if (w.length >= 11) return 2;
  if (w.length >= 7) return 1;
  return 0;
}

function tokenEq(a: string, b: string): boolean {
  if (a === SB || b === SB) return false;
  if (a === b) return true;
  const allow = Math.min(rubricTypoAllowance(a), rubricTypoAllowance(b));
  if (allow === 0 || areConfusable(a, b)) return false;
  return editDistance(a, b, allow) <= allow;
}

interface PhraseMatch {
  start: number;
  end: number;
}

/**
 * Find the tightest window in the response containing every important token of the phrase.
 * With `sameSentence`, the words must all appear in one sentence.
 */
export function findPhrase(responseStems: string[], phrase: string, sameSentence = false): PhraseMatch | null {
  const need = importantTokens(phrase);
  if (!need.length) return null;
  const positions = need.map((n) => responseStems.flatMap((r, i) => (tokenEq(n, r) ? [i] : [])));
  if (positions.some((p) => p.length === 0)) return null;
  const maxSpan = Math.max(8, need.length * 4);
  let best: PhraseMatch | null = null;
  for (const anchor of positions[0]) {
    let lo = anchor;
    let hi = anchor;
    for (const plist of positions.slice(1)) {
      let closest = plist[0];
      for (const p of plist) if (Math.abs(p - anchor) < Math.abs(closest - anchor)) closest = p;
      lo = Math.min(lo, closest);
      hi = Math.max(hi, closest);
    }
    if (sameSentence && responseStems.slice(lo, hi + 1).includes(SB)) continue;
    if (hi - lo + 1 <= maxSpan && (!best || hi - lo < best.end - best.start)) best = { start: lo, end: hi };
  }
  return best;
}

function negatedNear(tokens: string[], m: PhraseMatch): boolean {
  for (let i = Math.max(0, m.start - 3); i <= m.end; i++) if (NEGATORS.has(tokens[i])) return true;
  return false;
}

export interface RubricResult {
  score: number; // 0..1 fraction
  detail: GradeDetail;
  needsReview: boolean;
}

export function gradeShortAnswerRubric(data: ShortAnswerData, raw: string): RubricResult {
  const text = (raw ?? "").trim();
  const words = wordCount(text);
  const minWords = data.minWords ?? 6;
  const tokens = tokenize(text);
  const stems = tokens.map(looseStem);
  const flags: string[] = [];

  const totalWeight = data.rubric.reduce((s, c) => s + Math.max(0, c.points), 0) || 1;
  const criteria: CriterionResult[] = data.rubric.map((c) => {
    for (const phrase of c.phrases) {
      const m = findPhrase(stems, phrase);
      if (m) {
        if (negatedNear(tokens, m)) flags.push(`“${c.concept}” may be stated negatively`);
        return { id: c.id, concept: c.concept, points: c.points, met: true, evidence: tokens.slice(m.start, m.end + 1).filter((t) => t !== SB).join(" ") };
      }
    }
    return { id: c.id, concept: c.concept, points: c.points, met: false };
  });

  for (const mis of data.misconceptions ?? []) {
    if (findPhrase(stems, mis, true)) flags.push(`Possible misconception: “${mis}”`);
  }

  const earned = criteria.filter((c) => c.met).reduce((s, c) => s + Math.max(0, c.points), 0);
  const score = Math.min(1, earned / totalWeight);

  if (!text) {
    return { score: 0, needsReview: false, detail: { correct: false, criteria, confidence: "high", note: "No answer" } };
  }
  if (words < minWords && score > 0) flags.push("Very short answer");
  if (score > 0 && score < 1) flags.push("Partial credit");
  if (score === 0 && words >= 12) flags.push("No rubric ideas detected in a full answer — may be worded differently");

  const confident = flags.length === 0 && (score === 1 || words < 4);
  return {
    score,
    needsReview: !confident,
    detail: {
      correct: score === 1 ? true : score === 0 ? false : null,
      criteria,
      confidence: confident ? "high" : "low",
      flags: flags.length ? flags : undefined,
    },
  };
}
