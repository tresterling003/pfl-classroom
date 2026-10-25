/**
 * Calibration: realistic student answers to the seeded short-answer questions.
 * Checks the fallback rubric grader gives sensible SUGGESTED scores. (All rubric scores
 * are provisional and the uncertain ones are flagged for the teacher.)
 */
import { describe, expect, it } from "vitest";
import { gradeShortAnswerRubric } from "@/lib/grading/rubric";
import { SHORT_ANSWER } from "@/lib/seed/economics-review";
import type { ShortAnswerData } from "@/lib/types";

const q = (i: number) => SHORT_ANSWER[i].data as ShortAnswerData;
const grade = (i: number, text: string) => gradeShortAnswerRubric(q(i), text);

describe("short-answer calibration (realistic student writing)", () => {
  it("Q1 product vs resource market", () => {
    expect(grade(0, "in the product market people buy stuff like food and clothes from businesses. in the resource market businesses get land, labor, capital and entrepreneurship from households so its opposite").score).toBe(1);
    const partial = grade(0, "the product market is where you buy products");
    expect(partial.score).toBeGreaterThan(0);
    expect(partial.score).toBeLessThan(1);
    expect(partial.needsReview).toBe(true);
  });
  it("Q2 demand curve slopes down", () => {
    expect(grade(1, "because when prices go up people buy less, and when its cheaper people buy more since they can afford it. thats the law of demand").score).toBe(1);
    expect(grade(1, "When the price is high people buy less").score).toBeGreaterThanOrEqual(0.5);
    const wrong = grade(1, "Because when the price goes up people buy more of it");
    expect(wrong.score).toBe(0);
    expect(wrong.needsReview).toBe(true); // flagged misconception or full answer with no ideas
  });
  it("Q3 shortage for a sneaker store", () => {
    expect(grade(2, "a shortage means more people want the shoes than the store has so they sell out. the price is too low so the store could raise the price").score).toBe(1);
    expect(grade(2, "They run out of shoes.").score).toBeGreaterThan(0);
  });
  it("Q4 four exchanges", () => {
    expect(grade(3, "Households give businesses resources like labor. Businesses pay households income or wages. Households spend money buying goods. Businesses provide goods and services to households.").score).toBe(1);
    expect(grade(3, "households work and get paid").score).toBeGreaterThan(0);
  });
  it("Q5 equilibrium at $6", () => {
    expect(grade(4, "at $6 the quantity supplied and quantity demanded are both 300 so they are equal and there is no shortage or surplus. its where the lines cross").score).toBe(1);
  });
  it("Q6 surplus at $9", () => {
    expect(grade(5, "there are too many sandwiches left over because 500 - 100 = 400. the price is too high").score).toBe(1);
    const noCalc = grade(5, "there would be extra sandwiches that people dont buy");
    expect(noCalc.score).toBeGreaterThan(0);
    expect(noCalc.score).toBeLessThan(1);
  });
  it("Q7 households and businesses depend on each other", () => {
    expect(grade(6, "businesses need workers and customers to buy their products and households need jobs to earn money so they can buy goods").score).toBe(1);
  });
  it("Q8 law of supply with an example", () => {
    expect(grade(7, "if the price of my phone cases goes up I will make more of them because I earn more profit").score).toBe(1);
  });
  it("Q10 video game shortage", () => {
    expect(grade(9, "it is a shortage because more people want the game than there are copies. the price is too low").score).toBe(1);
    const wrong = grade(9, "it is a surplus because the stores have too many games");
    expect(wrong.score).toBeLessThan(0.5);
    expect(wrong.needsReview).toBe(true);
  });
});
