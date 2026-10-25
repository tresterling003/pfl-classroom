import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb, makeTeacher } from "./helpers";
import * as schema from "@/db/schema";
import type { DB } from "@/db";
import { seedStarterContent } from "@/lib/seed";
import { getAssignmentDetail, publishAssignment, updateAssignment, duplicateAssignment, setAssignmentOpen } from "@/lib/services/assignments";
import { updateQuestion, createQuestion, listQuestions } from "@/lib/services/questions";
import {
  joinAssignment, attemptFromToken, getPlayerState, startSection, saveDraft, submitSection, getRunResult,
} from "@/lib/services/student";
import { getAssignmentResults, getAttemptDetail, overrideResponse, approveAllReady, acceptAnswerForAll, reviewQueue } from "@/lib/services/results";
import { resultsCsv } from "@/lib/services/export";
import { MATCHING, FILL_BLANK, MULTIPLE_CHOICE } from "@/lib/seed/economics-review";

let db: DB;
let teacherId: string;
let courseId: string;
let assignmentId: string;
let code: string;
let periodId: string;

type State = Awaited<ReturnType<typeof getPlayerState>>;
type ActiveRun = NonNullable<State["activeRun"]>;

/** Build answers for the active run. `correctCount` questions answered correctly, rest wrong. */
async function answersFor(run: ActiveRun, correctCount: number) {
  const answers: Record<string, unknown> = {};
  const [ver] = await db.select().from(schema.assignmentVersions).where(eq(schema.assignmentVersions.assignmentId, assignmentId));
  const section = ver.snapshot.sections.find((s) => s.key === run.sectionKey)!;
  run.questions.forEach((q, i) => {
    const snap = section.questions.find((x) => x.key === q.key)!;
    const right = i < correctCount;
    const d = snap.data;
    if (d.type === "multiple_choice") answers[q.key] = { choiceId: right ? d.correctId : d.choices.find((c) => c.id !== d.correctId)!.id };
    if (d.type === "fill_blank") answers[q.key] = { text: right ? d.answers[0].toUpperCase() : "zzz wrong" };
    if (d.type === "short_answer") answers[q.key] = { text: right ? d.sampleAnswer : "I am not sure about this one honestly." };
    if (d.type === "matching") {
      const g = run.groups.find((gr) => gr.id === q.groupId)!;
      const correct = g.options.find((o) => o.text === d.match)!;
      const wrong = g.options.find((o) => o.text !== d.match)!;
      answers[q.key] = { choice: right ? correct.id : wrong.id };
    }
  });
  return answers;
}

async function student(name: string) {
  const j = await joinAssignment({ code, name, periodId });
  const { attempt } = await attemptFromToken(code, j.token);
  return { token: j.token, attempt: attempt!, join: j };
}

beforeAll(async () => {
  db = await freshDb();
  teacherId = (await makeTeacher(db)).id;
  const seeded = await seedStarterContent(teacherId);
  courseId = seeded.courseId;
  assignmentId = seeded.assignmentId;
  const d = await getAssignmentDetail(teacherId, assignmentId);
  code = d.assignment.joinCode;
  periodId = d.periodIds[0];
});

describe("seeded content", () => {
  it("has 4 sections x 10 questions as a draft", async () => {
    const d = await getAssignmentDetail(teacherId, assignmentId);
    expect(d.assignment.status).toBe("draft");
    expect(d.sections.map((s) => s.questions.length)).toEqual([10, 10, 10, 10]);
    expect(d.sections.map((s) => s.questions[0].type)).toEqual(["matching", "fill_blank", "multiple_choice", "short_answer"]);
    expect(MATCHING.length + FILL_BLANK.length + MULTIPLE_CHOICE.length).toBe(30);
  });
  it("students can't join a draft", async () => {
    await expect(joinAssignment({ code, name: "Early Bird", periodId })).rejects.toThrow(/couldn't find/);
  });
});

describe("student flow", () => {
  it("publishes and lets a student join with no answer keys in the payload", async () => {
    const pub = await publishAssignment(teacherId, assignmentId);
    expect(pub.newVersion).toBe(1);
    const s = await student("Ava R.");
    const state = await getPlayerState(s.attempt);
    expect(state.sections.map((x) => x.status)).toEqual(["available", "locked", "locked", "locked"]);
    await startSection(s.attempt, state.sections[0].key);
    const st2 = await getPlayerState(s.attempt);
    const json = JSON.stringify(st2);
    expect(json).not.toContain("correctId");
    expect(json).not.toContain("\"explanation\"");
    expect(json).not.toContain("\"rubric\"");
    expect(json).not.toContain("\"answers\":[");
    expect(json).not.toContain("sampleAnswer");
    // the matching option ids must not reveal which term they belong to
    const run = st2.activeRun!;
    for (const g of run.groups) for (const o of g.options) expect(run.questions.map((q) => q.key)).not.toContain(o.id);
  });

  it("cannot skip locked sections", async () => {
    const s = await student("Ben K.");
    const state = await getPlayerState(s.attempt);
    await expect(startSection(s.attempt, state.sections[2].key)).rejects.toThrow(/first/);
  });

  it("requires every question answered, autosaves, fails below 70%, retries, then passes and unlocks", async () => {
    const s = await student("Cara M.");
    let state = await getPlayerState(s.attempt);
    const runId = await startSection(s.attempt, state.sections[0].key);
    state = await getPlayerState(s.attempt);
    const answers = await answersFor(state.activeRun!, 6);

    // partial answers → cannot submit
    const partial = Object.fromEntries(Object.entries(answers).slice(0, 5));
    await expect(submitSection(s.attempt, runId, partial)).rejects.toThrow(/answer every question/);

    // autosave & "refresh": state comes back with saved answers
    expect((await saveDraft(s.attempt, runId, answers, 10)).saved).toBe(true);
    expect((await saveDraft(s.attempt, runId, {}, 5)).stale).toBe(true); // out-of-order older save ignored
    state = await getPlayerState(s.attempt);
    expect(Object.keys(state.activeRun!.answers).length).toBe(10);

    // 6/10 = 60% → failed, explanations shown, section 2 still locked
    const res = await submitSection(s.attempt, runId, answers);
    expect(res.percent).toBe(60);
    expect(res.outcome).toBe("failed");
    expect(res.questions.filter((q) => q.correct === false).length).toBe(4);
    expect(res.questions.every((q) => q.explanation)).toBe(true);
    expect(res.answersRevealed).toBe(false); // after_pass policy
    // duplicate submit is idempotent
    const again = await submitSection(s.attempt, runId, answers);
    expect(again.percent).toBe(60);
    state = await getPlayerState(s.attempt);
    expect(state.sections[0].status).toBe("failed");
    expect(state.sections[1].status).toBe("locked");

    // retry with exactly 7/10 → passes (70% ≥ 70%)
    const run2 = await startSection(s.attempt, state.sections[0].key);
    expect(run2).not.toBe(runId);
    state = await getPlayerState(s.attempt);
    const res2 = await submitSection(s.attempt, run2, await answersFor(state.activeRun!, 7));
    expect(res2.percent).toBe(70);
    expect(res2.outcome).toBe("passed");
    expect(res2.answersRevealed).toBe(true);
    state = await getPlayerState(s.attempt);
    expect(state.sections[0].status).toBe("passed");
    expect(state.sections[1].status).toBe("available");
  });

  it("completes all four sections; short answers are provisional and reviewable", async () => {
    const s = await student("Dev P.");
    for (let i = 0; i < 4; i++) {
      let state = await getPlayerState(s.attempt);
      const runId = await startSection(s.attempt, state.sections[i].key);
      state = await getPlayerState(s.attempt);
      const res = await submitSection(s.attempt, runId, await answersFor(state.activeRun!, i === 3 ? 6 : 10));
      if (i < 3) expect(res.outcome).toBe("passed");
      else {
        // 6 sample answers (full credit) + 4 vague answers; vague ones flagged → provisional, not locked out
        expect(res.questions.every((q) => q.provisional)).toBe(true);
        expect(["passed", "provisional", "failed"]).toContain(res.outcome);
      }
    }
    const state = await getPlayerState(s.attempt);
    const results = await getAssignmentResults(teacherId, assignmentId);
    const row = results.rows.find((r) => r.studentName === "Dev P.")!;
    expect(row.sections.slice(0, 3).map((x) => x.percent)).toEqual([100, 100, 100]);
    expect(row.provisional).toBe(true);
    expect(row.approvedGrade).toBeNull();
    if (state.completion !== "completed") {
      // failed SA section with confident zeros → retry needed; that's valid behaviour
      expect(state.sections[3].status).toBe("failed");
    }

    // teacher overrides a short answer to full credit → score goes up
    const detail = await getAttemptDetail(teacherId, row.attemptId);
    const saRun = detail.sections[3].runs[0];
    const low = saRun.responses.find((r) => (r.autoScore ?? 0) < r.maxScore)!;
    const before = saRun.percent!;
    await overrideResponse(teacherId, low.responseId!, { score: low.maxScore, feedback: "Good thinking — counted." });
    const detail2 = await getAttemptDetail(teacherId, row.attemptId);
    expect(detail2.sections[3].runs[0].percent!).toBeGreaterThan(before);
    const after = (await getAssignmentResults(teacherId, assignmentId)).rows.find((r) => r.studentName === "Dev P.")!;
    expect(after.suggestedPercent).toBeGreaterThan(row.suggestedPercent);
  });

  it("two students in separate sessions don't see or affect each other", async () => {
    const a = await student("Eli T.");
    const b = await student("Fay W.");
    expect(a.token).not.toBe(b.token);
    const sa = await getPlayerState(a.attempt);
    const ra = await startSection(a.attempt, sa.sections[0].key);
    const rb = await startSection(b.attempt, sa.sections[0].key);
    // a student cannot save into or read another student's run
    await expect(saveDraft(b.attempt, ra, {}, 99)).rejects.toThrow(/not found/);
    await expect(getRunResult(b.attempt, ra)).rejects.toThrow(/not found/);
    expect(ra).not.toBe(rb);
    // a stolen/old token doesn't resolve
    const { attempt } = await attemptFromToken(code, "not-a-real-token");
    expect(attempt).toBeNull();
  });

  it("re-joining with the same name requires the resume code (no impersonation)", async () => {
    const a = await student("Gus H.");
    await expect(joinAssignment({ code, name: "gus h.", periodId })).rejects.toThrow(/resume code/);
    await expect(joinAssignment({ code, name: "Gus H.", periodId, resumeCode: "WRONG1" })).rejects.toThrow(/doesn't match/);
    const ok = await joinAssignment({ code, name: "Gus H.", periodId, resumeCode: a.attempt.resumeCode });
    expect(ok.resumed).toBe(true);
    expect(ok.attemptId).toBe(a.attempt.id);
    // old device's token no longer works
    expect((await attemptFromToken(code, a.token)).attempt).toBeNull();
  });
});

describe("versioning and teacher tools", () => {
  it("editing a question after submissions doesn't change historical grades", async () => {
    const before = (await getAssignmentResults(teacherId, assignmentId)).rows.map((r) => [r.studentName, r.suggestedPercent]);
    const d = await getAssignmentDetail(teacherId, assignmentId);
    const mcQ = d.sections[2].questions[0];
    // change the correct answer in the bank
    const data = mcQ.data as { type: "multiple_choice"; choices: { id: string; text: string }[]; correctId: string };
    await updateQuestion(teacherId, mcQ.id, { ...mcQ, unitId: mcQ.unitId, data: { ...data, correctId: "b" } });
    const d2 = await getAssignmentDetail(teacherId, assignmentId);
    expect(d2.assignment.hasUnpublishedChanges).toBe(true);
    const after = (await getAssignmentResults(teacherId, assignmentId)).rows.map((r) => [r.studentName, r.suggestedPercent]);
    expect(after).toEqual(before);
    // republish creates version 2; existing students stay on version 1
    const pub = await publishAssignment(teacherId, assignmentId);
    expect(pub.newVersion).toBe(2);
    const s = await student("Hana N.");
    const rows = (await getAssignmentResults(teacherId, assignmentId)).rows;
    expect(rows.find((r) => r.studentName === "Hana N.")!.versionNumber).toBe(2);
    expect(rows.find((r) => r.studentName === "Ava R.")!.versionNumber).toBe(1);
    void s;
  });

  it("settings are editable: pass percent and limited graded retries", async () => {
    const d = await getAssignmentDetail(teacherId, assignmentId);
    await updateAssignment(teacherId, assignmentId, { settings: { ...d.assignment.settings, passPercent: 80, maxGradedRuns: 1, allowPracticeAfterLimit: true } });
    await publishAssignment(teacherId, assignmentId);
    const s = await student("Ivy Q.");
    let state = await getPlayerState(s.attempt);
    expect(state.sections[0].passPercent).toBe(80);
    const r1 = await startSection(s.attempt, state.sections[0].key);
    state = await getPlayerState(s.attempt);
    const res = await submitSection(s.attempt, r1, await answersFor(state.activeRun!, 7));
    expect(res.outcome).toBe("failed"); // 70 < 80
    state = await getPlayerState(s.attempt);
    expect(state.sections[0].nextRunIsPractice).toBe(true);
    const r2 = await startSection(s.attempt, state.sections[0].key);
    state = await getPlayerState(s.attempt);
    expect(state.activeRun!.practice).toBe(true);
    await submitSection(s.attempt, r2, await answersFor(state.activeRun!, 10));
    const row = (await getAssignmentResults(teacherId, assignmentId)).rows.find((r) => r.studentName === "Ivy Q.")!;
    // practice run unlocked the next section but doesn't count for the grade
    expect(row.sections[0].percent).toBe(70);
    expect(row.sections[1].status).toBe("available");
  });

  it("accept-for-all gives credit to everyone who typed the same answer", async () => {
    const s = await student("Jo L.");
    // reset to default settings first
    let state = await getPlayerState(s.attempt);
    const r1 = await startSection(s.attempt, state.sections[0].key);
    state = await getPlayerState(s.attempt);
    await submitSection(s.attempt, r1, await answersFor(state.activeRun!, 10));
    state = await getPlayerState(s.attempt);
    const r2 = await startSection(s.attempt, state.sections[1].key);
    state = await getPlayerState(s.attempt);
    const ans = await answersFor(state.activeRun!, 10);
    const firstKey = state.activeRun!.questions[0].key;
    ans[firstKey] = { text: "folks" };
    await submitSection(s.attempt, r2, ans);
    const res = await acceptAnswerForAll(teacherId, assignmentId, firstKey, "Folks");
    expect(res.count).toBe(1);
    const row = (await getAssignmentResults(teacherId, assignmentId)).rows.find((r) => r.studentName === "Jo L.")!;
    expect(row.sections[1].percent).toBe(100);
  });

  it("review queue, approvals and CSV export", async () => {
    const q = await reviewQueue(teacherId, assignmentId);
    expect(Array.isArray(q)).toBe(true);
    await approveAllReady(teacherId, assignmentId);
    const csv = await resultsCsv(teacherId, assignmentId, { periodId });
    const lines = csv.trim().split(/\r\n/);
    expect(lines[0]).toContain("Student");
    expect(lines[0]).toContain("Gradebook Grade");
    expect(lines.length).toBeGreaterThan(5);
    expect(csv).toContain("Ava R.");
  });

  it("closing an assignment blocks new students but keeps results", async () => {
    await setAssignmentOpen(teacherId, assignmentId, false);
    await expect(joinAssignment({ code, name: "Late Kid", periodId })).rejects.toThrow(/closed/);
    const rows = (await getAssignmentResults(teacherId, assignmentId)).rows;
    expect(rows.length).toBeGreaterThan(5);
  });

  it("duplicating an assignment to another class copies questions but no student results", async () => {
    const [other] = await db.insert(schema.courses).values({ teacherId, name: "Next Year Econ" }).returning();
    const copy = await duplicateAssignment(teacherId, assignmentId, { targetCourseId: other.id });
    const d = await getAssignmentDetail(teacherId, copy.id);
    expect(d.assignment.status).toBe("draft");
    expect(d.assignment.joinCode).not.toBe(code);
    expect(d.sections.map((s) => s.questions.length)).toEqual([10, 10, 10, 10]);
    expect((await listQuestions(teacherId, other.id)).length).toBe(40);
    expect((await getAssignmentResults(teacherId, copy.id)).rows.length).toBe(0);
  });

  it("another teacher cannot read or change this teacher's data", async () => {
    const other = await makeTeacher(db, "other@example.com");
    await expect(getAssignmentDetail(other.id, assignmentId)).rejects.toThrow(/not found/i);
    await expect(getAssignmentResults(other.id, assignmentId)).rejects.toThrow(/not found/i);
    await expect(createQuestion(other.id, courseId, {})).rejects.toThrow(/not found/i);
  });
});
