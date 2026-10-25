/** Validation for question input (editor, import, API). Shared by client and server. */
import { z } from "zod";
import type { QuestionData } from "./types";

const text = (max: number) => z.string().trim().max(max);

export const questionDataSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("matching"),
    match: text(1000).min(1, "Enter the correct match"),
    distractors: z.array(text(1000)).max(10).optional(),
  }),
  z.object({
    type: z.literal("fill_blank"),
    answers: z.array(text(300)).min(1).max(30),
    rejected: z.array(text(300)).max(30).optional(),
    allowTypos: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("multiple_choice"),
    choices: z.array(z.object({ id: z.string().min(1).max(40), text: text(1000).min(1, "Choices cannot be empty") })).min(2).max(8),
    correctId: z.string().min(1),
    shuffle: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("short_answer"),
    rubric: z
      .array(
        z.object({
          id: z.string().min(1).max(40),
          concept: text(500).min(1, "Describe each rubric idea"),
          points: z.number().min(0).max(100),
          phrases: z.array(text(300)).max(40),
        }),
      )
      .min(1)
      .max(10),
    sampleAnswer: text(4000),
    misconceptions: z.array(text(300)).max(20).optional(),
    minWords: z.number().int().min(0).max(200).optional(),
  }),
]);

export const questionInputSchema = z.object({
  prompt: text(4000).min(1, "Question wording is required"),
  data: questionDataSchema,
  explanation: text(4000).default(""),
  topic: text(120).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  points: z.number().min(0).max(100).default(1),
  tags: z.array(text(60)).max(20).default([]),
  unitId: z.string().uuid().nullable().optional(),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Extra checks zod can't express nicely. Returns a list of human-readable problems. */
export function questionProblems(q: { prompt: string; data: QuestionData }): string[] {
  const p: string[] = [];
  const d = q.data;
  if (d.type === "multiple_choice") {
    if (!d.choices.some((c) => c.id === d.correctId)) p.push("Pick which choice is correct.");
    const ids = new Set(d.choices.map((c) => c.id));
    if (ids.size !== d.choices.length) p.push("Choice ids must be unique.");
  }
  if (d.type === "fill_blank" && !d.answers.some((a) => a.trim())) p.push("Add at least one accepted answer.");
  if (d.type === "short_answer" && !d.rubric.some((c) => c.points > 0)) p.push("Give at least one rubric idea some points.");
  if (d.type === "short_answer" && d.rubric.some((c) => !c.phrases.some((x) => x.trim())))
    p.push("Each rubric idea needs at least one example phrase (used by the automatic grader).");
  return p;
}
