/**
 * Spreadsheet (CSV) format for the question bank — so teachers can write questions in
 * Google Sheets / Excel and import them. Shared by browser (import) and server (export).
 *
 * Columns:
 *   Type | Question | Correct Answer | Other Choices / Alternatives | Rejected Answers | Rubric | Explanation | Topic | Difficulty | Points | Unit
 * Lists inside a cell are separated with " | ".
 * Rubric (short answer): ideas separated by " || ", each written as  "Idea text [points] = phrase; phrase"
 */
import { toCsv } from "./csv";
import type { QuestionData, QuestionType } from "./types";

export const CSV_HEADERS = ["Type", "Question", "Correct Answer", "Other Choices / Alternatives", "Rejected Answers", "Rubric", "Explanation", "Topic", "Difficulty", "Points", "Unit"];

const TYPE_NAMES: Record<string, QuestionType> = {
  matching: "matching", match: "matching",
  "fill in the blank": "fill_blank", fill_blank: "fill_blank", fib: "fill_blank", "fill-in-the-blank": "fill_blank", blank: "fill_blank",
  "multiple choice": "multiple_choice", multiple_choice: "multiple_choice", mc: "multiple_choice",
  "short answer": "short_answer", short_answer: "short_answer", sa: "short_answer",
};

const TYPE_LABEL: Record<QuestionType, string> = { matching: "Matching", fill_blank: "Fill in the Blank", multiple_choice: "Multiple Choice", short_answer: "Short Answer" };

const split = (s: string, sep = "|") => (s ?? "").split(sep).map((x) => x.trim()).filter(Boolean);

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

export interface ImportItem {
  type: QuestionType;
  prompt: string;
  data: QuestionData;
  explanation: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  unit?: string;
}

export function csvToQuestions(text: string): { questions: ImportItem[]; errors: string[] } {
  const rows = parseCsv(text);
  const errors: string[] = [];
  const questions: ImportItem[] = [];
  if (!rows.length) return { questions, errors: ["The file is empty."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name.toLowerCase()));
  const idx = {
    type: col("type"), prompt: col("question"), answer: col("correct"), others: col("other"), rejected: col("rejected"),
    rubric: col("rubric"), explanation: col("explanation"), topic: col("topic"), difficulty: col("difficulty"), points: col("points"), unit: col("unit"),
  };
  if (idx.type < 0 || idx.prompt < 0) return { questions, errors: ['The first row must be the header row (it needs at least "Type" and "Question" columns).'] };
  rows.slice(1).forEach((r, i) => {
    const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "");
    const line = i + 2;
    const type = TYPE_NAMES[get("type").toLowerCase()];
    if (!type) return errors.push(`Row ${line}: unknown type “${get("type")}”. Use Matching, Fill in the Blank, Multiple Choice or Short Answer.`);
    const prompt = get("prompt");
    if (!prompt) return errors.push(`Row ${line}: the question is empty.`);
    const answer = get("answer");
    let data: QuestionData;
    if (type === "matching") {
      if (!answer) return errors.push(`Row ${line}: matching needs the correct match in “Correct Answer”.`);
      data = { type, match: answer, distractors: split(get("others")) };
    } else if (type === "fill_blank") {
      const answers = [answer, ...split(get("others"))].filter(Boolean);
      if (!answers.length) return errors.push(`Row ${line}: add the correct answer.`);
      data = { type, answers, rejected: split(get("rejected")), allowTypos: true };
    } else if (type === "multiple_choice") {
      const wrong = split(get("others"));
      if (!answer || wrong.length < 1) return errors.push(`Row ${line}: multiple choice needs a correct answer and at least one other choice.`);
      data = { type, choices: [answer, ...wrong].map((t, j) => ({ id: String.fromCharCode(97 + j), text: t })), correctId: "a", shuffle: true };
    } else {
      const ideas = split(get("rubric"), "||").map((chunk, j) => {
        // "Idea text [2] = phrase; phrase" — the idea itself may contain "=" (e.g. "300 = 300")
        const withPoints = chunk.match(/^([\s\S]*)\[(\d+(?:\.\d+)?)\]\s*=([\s\S]*)$/);
        const eq = chunk.indexOf("=");
        const concept = withPoints ? withPoints[1] : eq >= 0 ? chunk.slice(0, eq) : chunk;
        const phrases = withPoints ? withPoints[3] : eq >= 0 ? chunk.slice(eq + 1) : "";
        return { id: `c${j + 1}`, concept: concept.trim(), points: withPoints ? Number(withPoints[2]) : 1, phrases: split(phrases, ";") };
      });
      if (!ideas.length) return errors.push(`Row ${line}: short answer needs a Rubric, e.g. “Explains the law of demand [2] = price up buy less; higher price fewer”.`);
      data = { type, rubric: ideas.map((x) => ({ ...x, phrases: x.phrases.length ? x.phrases : [x.concept] })), sampleAnswer: answer, minWords: 6 };
    }
    const diff = get("difficulty").toLowerCase();
    questions.push({
      type,
      prompt: prompt.replace(/\\n/g, "\n"),
      data,
      explanation: get("explanation"),
      topic: get("topic"),
      difficulty: diff === "easy" || diff === "hard" ? diff : "medium",
      points: Number(get("points")) > 0 ? Number(get("points")) : 1,
      unit: get("unit") || undefined,
    });
  });
  return { questions, errors };
}

export function questionsToCsv(items: { type: QuestionType; prompt: string; data: unknown; explanation: string; topic: string; difficulty: string; points: number; unit?: string }[]) {
  const rows = items.map((q) => {
    const d = q.data as QuestionData;
    let answer = "", others = "", rejected = "", rubric = "";
    if (d.type === "matching") { answer = d.match; others = (d.distractors ?? []).join(" | "); }
    if (d.type === "fill_blank") { answer = d.answers[0] ?? ""; others = d.answers.slice(1).join(" | "); rejected = (d.rejected ?? []).join(" | "); }
    if (d.type === "multiple_choice") {
      answer = d.choices.find((c) => c.id === d.correctId)?.text ?? "";
      others = d.choices.filter((c) => c.id !== d.correctId).map((c) => c.text).join(" | ");
    }
    if (d.type === "short_answer") {
      answer = d.sampleAnswer;
      rubric = d.rubric.map((c) => `${c.concept} [${c.points}] = ${c.phrases.join("; ")}`).join(" || ");
    }
    return [TYPE_LABEL[q.type], q.prompt, answer, others, rejected, rubric, q.explanation, q.topic, q.difficulty, q.points, q.unit ?? ""];
  });
  return toCsv([CSV_HEADERS, ...rows]);
}
