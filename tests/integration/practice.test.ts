import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, makeTeacher } from "./helpers";
import type { DB } from "@/db";
import { createCourse } from "@/lib/services/courses";
import { createQuestion } from "@/lib/services/questions";
import { createAssignment, getAssignmentDetail, publishAssignment, setSectionQuestions } from "@/lib/services/assignments";
import { attemptFromToken, checkQuestion, getPlayerState, joinAssignment, saveDraft, startSection, submitSection } from "@/lib/services/student";

let db: DB;
let code: string;

beforeAll(async () => {
  db = await freshDb();
  const t = await makeTeacher(db);
  const c = await createCourse(t.id, { name: "Digital Arts & Animation" }); // no periods
  const q1 = await createQuestion(t.id, c.id, {
    prompt: "Which color model is used for screens?",
    data: { type: "multiple_choice", choices: [{ id: "a", text: "RGB" }, { id: "b", text: "CMYK" }], correctId: "a" },
    explanation: "Screens mix red, green and blue light.",
  });
  const q2 = await createQuestion(t.id, c.id, { prompt: "The color opposite red on the color wheel is ___.", data: { type: "fill_blank", answers: ["green"] }, explanation: "Complementary colors sit opposite each other." });
  const a = await createAssignment(t.id, c.id, { title: "Color Theory Practice", kind: "practice" });
  const d = await getAssignmentDetail(t.id, a.id);
  await setSectionQuestions(t.id, d.sections[0].id, [q1.id, q2.id]);
  await publishAssignment(t.id, a.id);
  code = d.assignment.joinCode;
});

describe("practice mode (immediate feedback)", () => {
  it("checks one question at a time, locks it, and submit uses the checked answer", async () => {
    const j = await joinAssignment({ code, name: "Eve S.", periodId: null }); // class without periods
    const { attempt } = await attemptFromToken(code, j.token);
    let st = await getPlayerState(attempt!);
    expect(st.assignment.settings.feedbackTiming).toBe("per_question");
    const runId = await startSection(attempt!, st.sections[0].key);
    st = await getPlayerState(attempt!);
    const [mc, fib] = st.activeRun!.questions;

    const fb = await checkQuestion(attempt!, runId, mc.key, { choiceId: "b" });
    expect(fb.correct).toBe(false);
    expect(fb.explanation).toContain("red, green and blue");
    expect(fb.correctAnswer).toBe("RGB"); // practice reveals answers

    // the checked answer can't be changed afterwards
    await saveDraft(attempt!, runId, { [mc.key]: { choiceId: "a" } }, Date.now());
    const fb2 = await checkQuestion(attempt!, runId, mc.key, { choiceId: "a" });
    expect(fb2.correct).toBe(false);

    const res = await submitSection(attempt!, runId, { [mc.key]: { choiceId: "a" }, [fib.key]: { text: "Green" } });
    expect(res.percent).toBe(50);
  });
});
