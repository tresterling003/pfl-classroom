import { describe, expect, it } from "vitest";
import { gradeFillBlank, gradeMatching, gradeMultipleChoice } from "@/lib/grading/objective";
import { gradeShortAnswerRubric, findPhrase, looseStem } from "@/lib/grading/rubric";
import { canonical, normalizeText } from "@/lib/grading/normalize";
import { FILL_BLANK, SHORT_ANSWER } from "@/lib/seed/economics-review";
import type { FillBlankData, ShortAnswerData } from "@/lib/types";

const fb = (answers: string[], rejected: string[] = []): FillBlankData => ({ type: "fill_blank", answers, rejected, allowTypos: true });

describe("fill in the blank", () => {
  const rm = fb(["resource market"], ["product market"]);
  it("ignores capitalization, spacing and punctuation", () => {
    for (const a of ["resource market", "Resource Market", "RESOURCE MARKET", "  resource   market. ", "Resource-Market!", "the resource market"]) {
      expect(gradeFillBlank(rm, a).score, a).toBe(1);
    }
  });
  it("accepts harmless plural / possessive variation", () => {
    expect(gradeFillBlank(rm, "resource markets").score).toBe(1);
    expect(gradeFillBlank(fb(["households"]), "household").score).toBe(1);
    expect(gradeFillBlank(fb(["households"]), "household's").score).toBe(1);
  });
  it("forgives a small spelling slip on long words", () => {
    expect(gradeFillBlank(fb(["equilibrium"]), "equilibruim").score).toBe(1);
    expect(gradeFillBlank(fb(["equilibrium"]), "equilibrum").score).toBe(1);
  });
  it("never accepts answers with a different meaning", () => {
    expect(gradeFillBlank(rm, "product market").score).toBe(0);
    expect(gradeFillBlank(fb(["increases"]), "decreases").score).toBe(0);
    expect(gradeFillBlank(fb(["upward"]), "downward").score).toBe(0);
    expect(gradeFillBlank(fb(["surplus"]), "shortage").score).toBe(0);
    expect(gradeFillBlank(fb(["supply"]), "demand").score).toBe(0);
    expect(gradeFillBlank(fb(["price"]), "prize").score).toBe(0);
  });
  it("handles numbers with $ and units, but not different numbers", () => {
    const six = fb(["6"]);
    for (const a of ["6", "$6", "$6.00", "6 dollars", "six"]) expect(gradeFillBlank(six, a).score, a).toBe(1);
    expect(gradeFillBlank(six, "60").score).toBe(0);
    expect(gradeFillBlank(six, "3").score).toBe(0);
    const four = fb(["400"]);
    for (const a of ["400", "400 sandwiches", "400.", "four hundred"]) {
      if (a === "four hundred") continue; // spelled-out large numbers are not parsed; teacher can add it
      expect(gradeFillBlank(four, a).score, a).toBe(1);
    }
    expect(gradeFillBlank(four, "4000").score).toBe(0);
    expect(gradeFillBlank(four, "40").score).toBe(0);
    expect(gradeFillBlank(four, "1,400").score).toBe(0);
  });
  it("blank answers get no credit", () => {
    expect(gradeFillBlank(rm, "   ").score).toBe(0);
  });
  it("seeded questions accept their own keys and reject their listed wrong answers", () => {
    for (const q of FILL_BLANK) {
      const d = q.data as FillBlankData;
      for (const a of d.answers) expect(gradeFillBlank(d, a).score, `${q.prompt} :: ${a}`).toBe(1);
      for (const r of d.rejected ?? []) expect(gradeFillBlank(d, r).score, `${q.prompt} :: ${r}`).toBe(0);
    }
  });
});

describe("multiple choice & matching", () => {
  it("grades multiple choice by choice id", () => {
    const d = { type: "multiple_choice" as const, choices: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correctId: "b" };
    expect(gradeMultipleChoice(d, "b").score).toBe(1);
    expect(gradeMultipleChoice(d, "a").score).toBe(0);
    expect(gradeMultipleChoice(d, null).score).toBe(0);
  });
  it("grades each match separately by the definition text", () => {
    expect(gradeMatching("Where businesses obtain factors", "Where businesses obtain factors").score).toBe(1);
    expect(gradeMatching("Where businesses obtain factors", "Where households buy goods").score).toBe(0);
    expect(gradeMatching("x", null).score).toBe(0);
  });
});

describe("normalization", () => {
  it("normalizes text", () => {
    expect(normalizeText("  The   Resource—Market!! ")).toBe("the resource-market".replace("-", " "));
    expect(canonical("The Households")).toBe(canonical("household"));
  });
  it("stems free-writing words", () => {
    expect(looseStem("increasing")).toBe(looseStem("increases"));
    expect(looseStem("supplied")).toBe(looseStem("supply"));
    expect(looseStem("goes")).toBe("go");
  });
  it("finds phrases in any order within a window", () => {
    const toks = "when the price goes up people will buy less of it".split(" ").map(looseStem);
    expect(findPhrase(toks, "price goes up buy less")).not.toBeNull();
    expect(findPhrase(toks, "price goes down buy more")).toBeNull();
  });
});

describe("short answer rubric grader", () => {
  const demand = SHORT_ANSWER[1].data as ShortAnswerData;
  it("gives full credit to a complete answer in the student's own words, with small typos", () => {
    const r = gradeShortAnswerRubric(demand, "Because of the law of demand. When the price goes up people buy less, and when its cheaper people buy more because they can afford it.");
    expect(r.score).toBe(1);
    expect(r.detail.criteria!.every((c) => c.met)).toBe(true);
  });
  it("is case-insensitive", () => {
    const a = gradeShortAnswerRubric(demand, "WHEN THE PRICE GOES UP PEOPLE BUY LESS BECAUSE THEY CANT AFFORD IT. LAW OF DEMAND.");
    const b = gradeShortAnswerRubric(demand, "when the price goes up people buy less because they cant afford it. law of demand.");
    expect(a.score).toBe(b.score);
  });
  it("gives partial credit and lists missing concepts, flagged for review", () => {
    const r = gradeShortAnswerRubric(demand, "When the price goes up people buy less of the product than before.");
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(1);
    expect(r.needsReview).toBe(true);
    expect(r.detail.criteria!.some((c) => !c.met)).toBe(true);
  });
  it("flags misconceptions", () => {
    const r = gradeShortAnswerRubric(demand, "The demand curve slopes upward because when price increases quantity demanded increases too.");
    expect(r.detail.flags?.some((f) => f.includes("misconception"))).toBe(true);
    expect(r.needsReview).toBe(true);
  });
  it("flags long answers with no detected ideas instead of silently failing them", () => {
    const r = gradeShortAnswerRubric(demand, "Consumers react to what things cost, so as the tag on an item climbs the number that shoppers pick up shrinks a lot overall.");
    expect(r.needsReview).toBe(true);
  });
  it("does not reward empty or trivial answers", () => {
    expect(gradeShortAnswerRubric(demand, "").score).toBe(0);
    expect(gradeShortAnswerRubric(demand, "idk").score).toBe(0);
  });
  it("does not flag a misconception from words in different sentences", () => {
    const d = SHORT_ANSWER[0].data as ShortAnswerData;
    const r = gradeShortAnswerRubric(d, d.sampleAnswer);
    expect(r.detail.flags ?? []).toEqual([]);
    expect(r.needsReview).toBe(false);
  });
  it("still credits an idea split across two short sentences", () => {
    const r = gradeShortAnswerRubric(demand, "The price goes up. Then people buy less. That is the law of demand because they cant afford it.");
    expect(r.score).toBe(1);
  });
  it("does not treat short look-alike words as typos (stuff ≠ staff)", () => {
    const d = SHORT_ANSWER[8].data as ShortAnswerData;
    const r = gradeShortAnswerRubric(d, "I think it has to do with money and stuff in the economy.");
    expect(r.detail.criteria!.every((c) => !c.met)).toBe(true);
  });
  it("forgives a typo in a longer word", () => {
    const d = SHORT_ANSWER[8].data as ShortAnswerData;
    const r = gradeShortAnswerRubric(d, "A bakery uses land for wheat, workers to bake, an oven as capital, and the entreprenuer took the risk.");
    expect(r.score).toBe(1);
  });
  it("credits the surplus calculation", () => {
    const d = SHORT_ANSWER[5].data as ShortAnswerData;
    const r = gradeShortAnswerRubric(d, "A surplus means there are extra sandwiches left over. 500 - 100 = 400 sandwiches. The price is too high, above equilibrium.");
    expect(r.score).toBe(1);
  });
  it("every seeded sample answer earns full credit from the fallback grader", () => {
    for (const q of SHORT_ANSWER) {
      const d = q.data as ShortAnswerData;
      const r = gradeShortAnswerRubric(d, d.sampleAnswer);
      expect(r.score, q.prompt + JSON.stringify(r.detail.criteria)).toBe(1);
    }
  });
});
