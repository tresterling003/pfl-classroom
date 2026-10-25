import type { GradeDetail, SnapshotQuestion } from "../types";
import { gradeFillBlank, gradeMatching, gradeMultipleChoice } from "./objective";
import { gradeShortAnswerRubric } from "./rubric";
import { aiConfigured, gradeShortAnswerAI } from "./ai";

export interface QuestionGrade {
  score: number; // points earned
  maxScore: number;
  method: "auto" | "rubric" | "ai";
  detail: GradeDetail;
  needsReview: boolean;
}

/**
 * Grade one answer against a frozen snapshot question.
 * For matching, `matchingChosenText` is the option text the student's token resolved to (server-side).
 */
export async function gradeQuestion(
  q: SnapshotQuestion,
  answer: unknown,
  opts: { matchingChosenText?: string | null; useAI?: boolean } = {},
): Promise<QuestionGrade> {
  const a = (answer ?? {}) as Record<string, unknown>;
  const max = q.points;
  const d = q.data;
  switch (d.type) {
    case "multiple_choice": {
      const r = gradeMultipleChoice(d, typeof a.choiceId === "string" ? a.choiceId : null);
      return { score: r.score * max, maxScore: max, method: "auto", detail: r.detail, needsReview: false };
    }
    case "matching": {
      const r = gradeMatching(d.match, opts.matchingChosenText ?? null);
      return { score: r.score * max, maxScore: max, method: "auto", detail: r.detail, needsReview: false };
    }
    case "fill_blank": {
      const r = gradeFillBlank(d, typeof a.text === "string" ? a.text : "");
      // Accepted-with-variation answers are fine; wrong answers can be reviewed from the results page.
      return { score: r.score * max, maxScore: max, method: "auto", detail: r.detail, needsReview: false };
    }
    case "short_answer": {
      const text = typeof a.text === "string" ? a.text : "";
      const rubric = gradeShortAnswerRubric(d, text);
      if (text.trim() && opts.useAI !== false && aiConfigured()) {
        try {
          const ai = await gradeShortAnswerAI(q.prompt, d, text);
          return { score: ai.score * max, maxScore: max, method: "ai", detail: ai.detail, needsReview: ai.needsReview };
        } catch (err) {
          console.error("AI grading failed; using rubric fallback", err);
        }
      }
      return { score: rubric.score * max, maxScore: max, method: "rubric", detail: rubric.detail, needsReview: rubric.needsReview };
    }
  }
}
