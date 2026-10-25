import { z } from "zod";
import type { AssignmentSettings } from "./types";

export const DEFAULT_SETTINGS: AssignmentSettings = {
  passPercent: 70,
  sequential: true,
  maxGradedRuns: 0,
  allowPracticeAfterLimit: true,
  gradeBasis: "best",
  feedbackTiming: "after_section",
  showExplanations: true,
  showCorrectAnswers: "after_pass",
  shuffleQuestions: false,
  shuffleChoices: true,
  shortAnswerProgression: "provisional",
  sectionWeighting: "equal",
  totalPoints: 100,
  showScores: true,
};

export const settingsSchema = z.object({
  passPercent: z.number().min(0).max(100),
  sequential: z.boolean(),
  maxGradedRuns: z.number().int().min(0).max(50),
  allowPracticeAfterLimit: z.boolean(),
  gradeBasis: z.enum(["best", "latest", "first"]),
  feedbackTiming: z.enum(["after_section", "per_question"]),
  showExplanations: z.boolean(),
  showCorrectAnswers: z.enum(["always", "after_pass", "after_close", "never"]),
  shuffleQuestions: z.boolean(),
  shuffleChoices: z.boolean(),
  shortAnswerProgression: z.enum(["provisional", "strict"]),
  sectionWeighting: z.enum(["equal", "points"]),
  totalPoints: z.number().min(1).max(10000),
  showScores: z.boolean(),
});

/** Fill any missing keys with defaults (older rows, imports). */
export function withDefaults(s: Partial<AssignmentSettings> | null | undefined): AssignmentSettings {
  return { ...DEFAULT_SETTINGS, ...(s ?? {}) };
}

/** Defaults by assignment type — teachers can change everything afterwards. */
export function settingsForKind(kind: string): AssignmentSettings {
  switch (kind) {
    case "quiz":
      return { ...DEFAULT_SETTINGS, sequential: false, passPercent: 0, maxGradedRuns: 1, allowPracticeAfterLimit: false, gradeBasis: "first", showCorrectAnswers: "after_close" };
    case "test":
      return { ...DEFAULT_SETTINGS, sequential: false, passPercent: 0, maxGradedRuns: 1, allowPracticeAfterLimit: false, gradeBasis: "first", showCorrectAnswers: "never", showExplanations: false, showScores: false };
    case "practice":
      return { ...DEFAULT_SETTINGS, sequential: false, passPercent: 0, feedbackTiming: "per_question", showCorrectAnswers: "always", gradeBasis: "best" };
    default:
      return { ...DEFAULT_SETTINGS };
  }
}
