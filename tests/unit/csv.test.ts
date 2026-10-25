import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { csvToQuestions, questionsToCsv } from "@/lib/questionCsv";
import { csvCell } from "@/lib/csv";
import { FILL_BLANK, MATCHING, MULTIPLE_CHOICE, SHORT_ANSWER } from "@/lib/seed/economics-review";
import { questionInputSchema, questionProblems } from "@/lib/questionSchema";

const all = [...MATCHING, ...FILL_BLANK, ...MULTIPLE_CHOICE, ...SHORT_ANSWER].map((q) => ({ ...q, type: q.data.type }));

describe("question spreadsheet import/export", () => {
  it("round-trips all 40 built-in questions without losing answers", () => {
    const csv = questionsToCsv(all);
    const { questions, errors } = csvToQuestions(csv);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(40);
    questions.forEach((q, i) => {
      expect(q.prompt).toBe(all[i].prompt);
      expect(q.type).toBe(all[i].type);
      const d = q.data, o = all[i].data;
      if (d.type === "multiple_choice" && o.type === "multiple_choice") {
        expect(d.choices.find((c) => c.id === d.correctId)!.text).toBe(o.choices.find((c) => c.id === o.correctId)!.text);
        expect(d.choices.map((c) => c.text).sort()).toEqual(o.choices.map((c) => c.text).sort());
      }
      if (d.type === "fill_blank" && o.type === "fill_blank") {
        expect(d.answers).toEqual(o.answers);
        expect(d.rejected).toEqual(o.rejected);
      }
      if (d.type === "short_answer" && o.type === "short_answer") {
        expect(d.rubric.map((c) => [c.concept, c.points, c.phrases])).toEqual(o.rubric.map((c) => [c.concept, c.points, c.phrases]));
      }
      // every imported question is valid for the editor/API
      const parsed = questionInputSchema.safeParse(q);
      expect(parsed.success).toBe(true);
      expect(questionProblems(q)).toEqual([]);
    });
  });
  it("the shipped template imports cleanly", () => {
    const { questions, errors } = csvToQuestions(fs.readFileSync("docs/question-template.csv", "utf8"));
    expect(errors).toEqual([]);
    expect(questions.length).toBeGreaterThan(3);
  });
  it("reports bad rows instead of importing garbage", () => {
    const { errors } = csvToQuestions("Type,Question,Correct Answer\nEssay,Write a poem,\nMultiple Choice,Pick one,A\n");
    expect(errors.length).toBe(2);
  });
  it("neutralizes spreadsheet formulas in exported cells", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toMatch(/^"'=/);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-5")).toBe("-5");
    expect(csvCell("Ava R.")).toBe("Ava R.");
  });
});
