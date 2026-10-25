/** Deterministic graders: fill in the blank, multiple choice, matching. */
import type { FillBlankData, GradeDetail, MultipleChoiceData } from "../types";
import { canonical, canonicalTokens, extractNumber, normalizeText, tokensMatchWithTypos } from "./normalize";

export interface ObjectiveResult {
  score: number; // 0..1 fraction of the question's points
  detail: GradeDetail;
}

const NEGATIONS = /\b(not|no|never|isn t|isnt|doesn t|doesnt|don t|dont|without)\b/;

/** Grade a fill-in-the-blank answer. Never case-sensitive; forgiving of harmless variation only. */
export function gradeFillBlank(data: FillBlankData, raw: string): ObjectiveResult {
  const text = (raw ?? "").trim();
  if (!text) return { score: 0, detail: { correct: false, note: "No answer" } };

  const studentCanon = canonical(text);
  const studentTokens = canonicalTokens(text);
  const studentNorm = normalizeText(text);

  // Teacher-listed wrong answers always lose, even if they'd otherwise fuzzy-match.
  for (const r of data.rejected ?? []) {
    if (canonical(r) === studentCanon) return { score: 0, detail: { correct: false } };
  }

  const accepted = data.answers.filter((a) => a.trim());
  // 1) exact match after normalization (case, punctuation, spacing, articles, plurals)
  for (const a of accepted) {
    if (canonical(a) === studentCanon) {
      return { score: 1, detail: { correct: true, note: normalizeText(a) === studentNorm ? undefined : `Accepted as “${a}”` } };
    }
  }
  // 2) numeric answers: "$400", "400 sandwiches", "400." all equal 400 — but "4000" does not.
  for (const a of accepted) {
    const expected = extractNumber(a);
    if (expected === null) continue;
    const got = extractNumber(text);
    if (got !== null && Math.abs(got - expected) < 1e-9 && !NEGATIONS.test(studentNorm)) {
      return { score: 1, detail: { correct: true, note: `Accepted as “${a}”` } };
    }
  }
  // 3) small spelling slips on longer words (never on numbers or opposite-meaning words)
  if (data.allowTypos !== false) {
    for (const a of accepted) {
      const res = tokensMatchWithTypos(canonicalTokens(a), studentTokens);
      if (res.match) {
        return { score: 1, detail: { correct: true, note: `Accepted with a spelling slip (expected “${a}”)` } };
      }
    }
  }
  return { score: 0, detail: { correct: false } };
}

export function gradeMultipleChoice(data: MultipleChoiceData, choiceId: string | null | undefined): ObjectiveResult {
  if (!choiceId) return { score: 0, detail: { correct: false, note: "No answer" } };
  const correct = choiceId === data.correctId;
  return { score: correct ? 1 : 0, detail: { correct } };
}

/**
 * Matching: the student's opaque option token is resolved server-side to the text it showed.
 * Correct when it is this item's own match (identical duplicate definitions also count).
 */
export function gradeMatching(ownMatch: string, chosenText: string | null | undefined): ObjectiveResult {
  if (chosenText == null) return { score: 0, detail: { correct: false, note: "No answer" } };
  const correct = canonical(chosenText) === canonical(ownMatch);
  return { score: correct ? 1 : 0, detail: { correct } };
}
