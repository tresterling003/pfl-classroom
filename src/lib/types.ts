// Shared domain types used by the database, grading engine and UI.

export type QuestionType = "matching" | "fill_blank" | "multiple_choice" | "short_answer";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  matching: "Matching",
  fill_blank: "Fill in the Blank",
  multiple_choice: "Multiple Choice",
  short_answer: "Short Answer",
};

/**
 * MATCHING — the question prompt is the term; `match` is its correct definition/example.
 * Consecutive matching questions in a section are shown together as one matching board,
 * so every other item's definition acts as a choice. `distractors` add extra wrong choices.
 */
export interface MatchingData {
  type: "matching";
  match: string;
  distractors?: string[];
}

/** FILL IN THE BLANK — prompt contains "___" (or the blank is at the end). */
export interface FillBlankData {
  type: "fill_blank";
  /** Accepted answers. First one is shown as "the" correct answer. */
  answers: string[];
  /** Answers that must NEVER be accepted even if they look close (e.g. "product market"). */
  rejected?: string[];
  /** Allow one-letter spelling slips on longer words. Default true. */
  allowTypos?: boolean;
}

export interface Choice {
  id: string;
  text: string;
}

export interface MultipleChoiceData {
  type: "multiple_choice";
  choices: Choice[];
  correctId: string;
  /** Allow the answer order to be randomized. Default true. Turn off for "All of the above". */
  shuffle?: boolean;
}

export interface RubricCriterion {
  id: string;
  /** The idea the student must express, written for students (used in feedback). */
  concept: string;
  /** Relative weight of this idea within the question. */
  points: number;
  /**
   * Ways a student might express the idea. One phrase per entry. A phrase counts when all
   * of its important words appear in the answer (any order, any capitalization, minor typos ok).
   */
  phrases: string[];
}

export interface ShortAnswerData {
  type: "short_answer";
  rubric: RubricCriterion[];
  sampleAnswer: string;
  /** Phrases that signal a common misunderstanding (e.g. "demand curve slopes upward"). Flags for review. */
  misconceptions?: string[];
  /** Answers shorter than this are flagged for review. Default 6. */
  minWords?: number;
}

export type QuestionData = MatchingData | FillBlankData | MultipleChoiceData | ShortAnswerData;

export type FeedbackTiming = "after_section" | "per_question";
export type RevealPolicy = "always" | "after_pass" | "after_close" | "never";
export type GradeBasis = "best" | "latest" | "first";

export interface AssignmentSettings {
  /** Score needed to unlock the next section (percent, 0-100). */
  passPercent: number;
  /** Sections must be done in order. When false students may open any section. */
  sequential: boolean;
  /** 0 = unlimited graded runs. Otherwise only the first N runs of a section count for the grade. */
  maxGradedRuns: number;
  /** After graded runs are used up, allow extra practice runs that don't change the grade. */
  allowPracticeAfterLimit: boolean;
  gradeBasis: GradeBasis;
  feedbackTiming: FeedbackTiming;
  showExplanations: boolean;
  showCorrectAnswers: RevealPolicy;
  shuffleQuestions: boolean;
  shuffleChoices: boolean;
  /**
   * provisional = a student whose short-answer section is below the pass mark only because of
   * answers the auto-grader is unsure about may continue; the teacher reviews later.
   * strict = must reach the pass mark on the automated score.
   */
  shortAnswerProgression: "provisional" | "strict";
  /** equal = each section worth the same share of totalPoints; points = by question points. */
  sectionWeighting: "equal" | "points";
  totalPoints: number;
  /** Students see their own scores while working (always on for reviews). */
  showScores: boolean;
}

export interface SectionSettings {
  /** Overrides the assignment pass percent for this section. */
  passPercent?: number | null;
  /** Serve a random subset of this many questions each run (0/empty = all). */
  drawCount?: number | null;
}

export interface SnapshotQuestion {
  key: string;
  sourceQuestionId: string;
  type: QuestionType;
  prompt: string;
  data: QuestionData;
  explanation: string;
  points: number;
  topic: string;
  difficulty: string;
}

export interface SnapshotSection {
  key: string;
  title: string;
  instructions: string;
  settings: SectionSettings;
  questions: SnapshotQuestion[];
}

export interface VersionSnapshot {
  title: string;
  kind: string;
  directions: string;
  settings: AssignmentSettings;
  sections: SnapshotSection[];
}

export interface CriterionResult {
  id: string;
  concept: string;
  points: number;
  met: boolean;
  /** Which phrase matched, when met. */
  evidence?: string;
}

export interface GradeDetail {
  /** true / false for objective items; null when partially correct. */
  correct: boolean | null;
  /** e.g. "Accepted (spelling)" or "Matched accepted answer: resource markets". */
  note?: string;
  criteria?: CriterionResult[];
  confidence?: "high" | "low";
  /** Reasons the response was flagged for review. */
  flags?: string[];
  aiRationale?: string;
}

/** Shape of a student's answer per question type. */
export type StudentAnswer =
  | { type: "matching"; choice: string | null } // opaque per-run option token (never the answer key)
  | { type: "fill_blank"; text: string }
  | { type: "multiple_choice"; choiceId: string | null }
  | { type: "short_answer"; text: string };
