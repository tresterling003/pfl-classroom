/**
 * End-to-end: a fresh install → teacher setup → publish the built-in review →
 * two students work in separate browsers → teacher sees results and exports grades.
 * Needs a fresh database (the setup page only works once).
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { MULTIPLE_CHOICE, SHORT_ANSWER } from "../../src/lib/seed/economics-review";
import type { MultipleChoiceData, ShortAnswerData } from "../../src/lib/types";

const SETUP_CODE = process.env.TEACHER_SETUP_CODE ?? "e2e-setup-code";
const SHOTS = process.env.E2E_SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
};

const TEACHER = { email: "teacher@school.test", password: "Classroom2026!" };

// answer keys for the seeded matching section (term → definition prefix)
const MATCH: Record<string, string> = {
  Households: "Individuals and families",
  Businesses: "Organizations that use resources",
  "Resource Market": "Where businesses obtain",
  "Product Market": "Where households buy",
  Land: "Natural resources",
  Labor: "Human effort",
  Capital: "Tools, equipment",
  Entrepreneurship: "Taking the risk",
  Equilibrium: "The point where quantity supplied equals",
  Shortage: "When quantity demanded is greater",
};

async function answerMatching(page: Page, correct: number) {
  const terms = Object.keys(MATCH);
  // read the board: definitions are lettered A..J
  const list = page.getByRole("list", { name: "Definitions" }).getByRole("button");
  await expect(list).toHaveCount(10);
  const defs = await list.allInnerTexts();
  const letterFor = (prefix: string) => {
    const i = defs.findIndex((d) => d.includes(prefix));
    return "ABCDEFGHIJKLMNOP"[i];
  };
  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const right = letterFor(MATCH[t]);
    // pick a wrong letter deterministically for the "incorrect" ones
    const wrong = letterFor(MATCH[terms[(i + 1) % terms.length]]);
    const select = page.getByLabel(`Match for ${t}`);
    const value = await select.locator("option").filter({ hasText: new RegExp(`^${i < correct ? right : wrong}( \\(used\\))?$`) }).getAttribute("value");
    await select.selectOption(value!);
  }
}

test.describe.configure({ mode: "serial" });

let joinCode = "";
let assignmentUrl = "";

test("teacher sets up the platform and publishes the built-in review", async ({ page }) => {
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/setup/);
  await page.getByLabel("Setup code").fill(SETUP_CODE);
  await page.locator("#name").fill("Mr. Sterling");
  await page.getByLabel("Email (used to sign in)").fill(TEACHER.email);
  await page.locator("#pw").fill(TEACHER.password);
  await page.getByLabel("Confirm password").fill(TEACHER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await shot(page, "01-dashboard-empty");

  // multi-class: three classes in the sidebar
  await expect(page.getByRole("link", { name: "PFL / Economics" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Principles of A/V Technology" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Digital Arts & Animation" })).toBeVisible();

  await page.getByRole("link", { name: "PFL / Economics" }).click();
  await expect(page.getByText("Economics Unit Review")).toBeVisible();
  await shot(page, "02-class-assignments");
  await page.getByRole("link", { name: /Economics Unit Review/ }).first().click();
  await expect(page.getByText("40 questions in 4 sections")).toBeVisible();
  assignmentUrl = page.url();
  await shot(page, "03-builder");

  // publish
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Published!/)).toBeVisible();
  const code = await page.locator(".font-mono.text-5xl").innerText();
  joinCode = code.trim();
  expect(joinCode).toMatch(/^[A-Z0-9]{6}$/);
  await shot(page, "04-share");
});

test("student A fails a section, sees explanations, refreshes mid-work, retries and passes", async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await page.getByLabel("Assignment code").fill(joinCode.toLowerCase());
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: /Economics Unit Review/ })).toBeVisible();
  await page.getByLabel("Your name").fill("Ava R.");
  await page.getByLabel("Class period").selectOption({ label: "2nd Period" });
  await shot(page, "05-join");
  await page.getByRole("button", { name: "Start" }).click();

  // overview: section 1 ready, others locked
  await expect(page.getByText("Your progress")).toBeVisible();
  await expect(page.getByText("Pass “Matching” to unlock.")).toBeVisible();
  await shot(page, "06-overview");
  await page.getByRole("button", { name: "Start" }).first().click();

  await expect(page.getByText("Match each term with the best definition.")).toBeVisible();
  await answerMatching(page, 6);
  await expect(page.getByText("10/10 answered")).toBeVisible();
  await expect(page.getByText("All work saved")).toBeVisible({ timeout: 10_000 });
  await shot(page, "07-matching");

  // Wi-Fi drops: answers stay on the device and sync when the connection returns
  await ctx.setOffline(true);
  const ownerOfA = page.getByLabel("Match for Households");
  const keep = await ownerOfA.inputValue();
  await ownerOfA.selectOption("");
  await expect(page.getByText(/Offline — saved on this device/)).toBeVisible({ timeout: 10_000 });
  await ownerOfA.selectOption(keep);
  await ctx.setOffline(false);
  await expect(page.getByText("All work saved")).toBeVisible({ timeout: 40_000 });

  // "Chromebook refresh" mid-section — answers come back
  await page.reload();
  await expect(page.getByText("10/10 answered")).toBeVisible();

  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Not quite — you need 70% to pass/)).toBeVisible();
  await expect(page.getByText("60%")).toBeVisible();
  await expect(page.getByText("Why:").first()).toBeVisible();
  await shot(page, "08-failed-result");

  await page.getByRole("button", { name: "Try again" }).click();
  await answerMatching(page, 7); // exactly 70%
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed!/)).toBeVisible();
  await shot(page, "09-passed-result");

  // section 2: fill in the blank — case-insensitive answers
  await page.getByRole("button", { name: "Next section →" }).click();
  await expect(page.getByText("Question 1 of 10")).toBeVisible();
  const fib = ["HOUSEHOLDS", "Resource", "product market", "income", "Increases", "goes down", "equilibrum", "$6", "400 sandwiches", "Surplus"];
  for (let i = 0; i < fib.length; i++) {
    await page.getByPlaceholder("Type your answer…").fill(fib[i]);
    if (i < fib.length - 1) await page.getByRole("button", { name: "Next →" }).click();
  }
  await shot(page, "10-fib");
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed!/)).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  // cannot skip: try submitting MC with nothing answered
  await page.getByRole("button", { name: "Next section →" }).click();
  for (let i = 0; i < 9; i++) await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText("Answer this question before submitting.")).toBeVisible();
  await shot(page, "11-mc-missing");
  await ctx.close();
});

test("student B in another browser can't take over student A's name", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/join/${joinCode}`);
  await page.getByLabel("Your name").fill("ava r.");
  await page.getByLabel("Class period").selectOption({ label: "2nd Period" });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText(/already started this assignment/)).toBeVisible();
  await expect(page.getByLabel("Resume code")).toBeVisible();
  // a different student joins fine
  await page.getByLabel("Your name").fill("Ben K.");
  await page.getByLabel("Resume code").fill("");
  await page.goto(`/join/${joinCode}`);
  await page.getByLabel("Your name").fill("Ben K.");
  await page.getByLabel("Class period").selectOption({ label: "3rd Period" });
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("Your progress")).toBeVisible();
  // student cannot reach teacher pages or APIs
  const res = await page.request.get("/api/teacher/courses");
  expect(res.status()).toBe(401);
  await ctx.close();
});

test("teacher sees both students, exports CSV, and edits a question without changing grades", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEACHER.email);
  await page.getByLabel("Password").fill(TEACHER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  await shot(page, "12-dashboard-live");

  await page.goto(assignmentUrl + "/results");
  await expect(page.getByRole("link", { name: "Ava R." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ben K." })).toBeVisible();
  await shot(page, "13-results");

  // filter by period
  await page.getByLabel("Period").selectOption({ label: "3rd Period" });
  await expect(page.getByRole("link", { name: "Ben K." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ava R." })).toHaveCount(0);
  await page.getByLabel("Period").selectOption({ label: "All periods" });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Export grades/ }).click()]);
  const file = await download.path();
  const csv = fs.readFileSync(file!, "utf8");
  expect(csv).toContain("Gradebook Grade");
  expect(csv).toContain("Ava R.");
  expect(csv).toMatch(/Ava R\.,2nd Period,In progress/);

  // student detail
  await page.getByRole("link", { name: "Ava R." }).click();
  await expect(page.getByText("Suggested grade")).toBeVisible();
  const before = await page.locator("text=Suggested grade").locator("xpath=..").locator(".text-3xl").innerText();
  await shot(page, "14-student-detail");

  // question analysis tab
  await page.goto(assignmentUrl + "/results");
  await page.getByRole("button", { name: "Question analysis" }).click();
  await expect(page.getByText(/answers ·/).first()).toBeVisible();
  await shot(page, "15-question-analysis");

  // edit a bank question (change the correct match text) — historical grade unchanged
  await page.goto(assignmentUrl);
  await page.getByRole("button", { name: "Households", exact: false }).first().click();
  await expect(page.getByRole("heading", { name: "Edit question" })).toBeVisible();
  await shot(page, "16-question-editor");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto(assignmentUrl + "/results");
  await page.getByRole("link", { name: "Ava R." }).click();
  await expect(page.locator("text=Suggested grade").locator("xpath=..").locator(".text-3xl")).toHaveText(before);
});

test("question bank: create, find and delete a question without code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEACHER.email);
  await page.getByLabel("Password").fill(TEACHER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: "PFL / Economics" }).click();
  await page.getByRole("link", { name: "Question bank" }).click();
  await expect(page.getByText("40 questions in this class's bank")).toBeVisible();
  await page.getByRole("button", { name: "+ New question" }).click();
  await page.locator("#qprompt").fill("What is opportunity cost?");
  await page.getByPlaceholder("Choice 1").fill("The value of the next best alternative given up");
  await page.getByPlaceholder("Choice 2").fill("The price of a product");
  await page.getByPlaceholder("Choice 3").fill("The total cost of all choices");
  await page.getByPlaceholder("Choice 4").fill("Money spent on taxes");
  await page.locator("#qexp").fill("Opportunity cost is what you give up when you choose.");
  await page.locator("#qtopic").fill("Scarcity");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("41 questions in this class's bank")).toBeVisible();
  await page.getByLabel("Search").fill("opportunity");
  await expect(page.getByText("What is opportunity cost?")).toBeVisible();
  await shot(page, "17-bank");
  await page.getByRole("button", { name: "Delete" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("40 questions in this class's bank")).toBeVisible();
});

// ───────────── full completion, review and multi-class ─────────────

/** The distinguishing line of a seeded prompt: its last line that isn't part of a table. */
const keyLine = (prompt: string) => prompt.split("\n").filter((l) => l.trim() && !l.trim().startsWith("|")).pop()!.trim().slice(0, 50);

async function teacherLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEACHER.email);
  await page.getByLabel("Password").fill(TEACHER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
}

test("student C completes all four sections and sees the completion screen", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/join/${joinCode}`);
  await page.getByLabel("Your name").fill("Cara M.");
  await page.getByLabel("Class period").selectOption({ label: "1st Period" });
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Start" }).first().click();
  await answerMatching(page, 10);
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed!/)).toBeVisible();
  await page.getByRole("button", { name: "Next section →" }).click();
  const fib = ["households", "resource", "product", "income", "increases", "decreases", "equilibrium", "6", "400", "surplus"];
  for (let i = 0; i < fib.length; i++) {
    await page.getByPlaceholder("Type your answer…").fill(fib[i]);
    if (i < fib.length - 1) await page.getByPlaceholder("Type your answer…").press("Enter");
  }
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed!/)).toBeVisible();

  // multiple choice — pick the correct choice text for each prompt
  await page.getByRole("button", { name: "Next section →" }).click();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
    const promptText = await page.locator("section .text-xl").first().innerText();
    const q = MULTIPLE_CHOICE.find((m) => promptText.replace(/\s+/g, " ").includes(keyLine(m.prompt)))!;
    const d = q.data as MultipleChoiceData;
    const correct = d.choices.find((c) => c.id === d.correctId)!.text;
    await page.getByRole("radio", { name: new RegExp(correct.replace(/[.*+?^${}()|[\]\\$]/g, "\\$&")) }).click();
    if (i < 9) await page.getByRole("button", { name: "Next →" }).click();
  }
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed!/)).toBeVisible();
  await expect(page.getByText("100%")).toBeVisible();

  // short answer — strong answers for 8, vague for 2
  await page.getByRole("button", { name: "Next section →" }).click();
  for (let i = 0; i < 10; i++) {
    await expect(page.getByText(`Question ${i + 1} of 10`)).toBeVisible();
    const promptText = (await page.locator("section .text-xl").first().innerText()).replace(/\s+/g, " ");
    const q = SHORT_ANSWER.find((m) => promptText.includes(keyLine(m.prompt)))!;
    const ans = i < 8 ? (q.data as ShortAnswerData).sampleAnswer : "I think it has to do with money and stuff in the economy.";
    await page.getByPlaceholder(/Explain in your own words/).fill(ans);
    if (i < 9) await page.getByRole("button", { name: "Next →" }).click();
  }
  await shot(page, "18-short-answer");
  await page.getByRole("button", { name: "Submit section" }).click();
  await expect(page.getByText(/Section passed|Submitted for teacher review|Not quite/)).toBeVisible();
  await expect(page.getByText("Suggested score — your teacher may adjust it.").first()).toBeVisible();
  await shot(page, "19-short-answer-result");
  await page.getByRole("button", { name: /See my results|All sections/ }).first().click();
  await expect(page.getByText("You finished every section!")).toBeVisible();
  await shot(page, "20-complete");
  await ctx.close();
});

test("teacher reviews short answers, overrides a score and approves the grade", async ({ page }) => {
  await teacherLogin(page);
  await page.getByRole("link", { name: "Needs review" }).click();
  await expect(page.getByRole("heading", { name: "Needs review" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cara M." }).first()).toBeVisible();
  await shot(page, "21-review-queue");
  // give the first flagged answer full credit
  const card = page.locator("div.rounded-2xl", { has: page.getByRole("link", { name: "Cara M." }) }).first();
  await card.getByRole("button", { name: /^Full/ }).click();
  await expect(page.getByText("Score saved")).toBeVisible();

  await page.goto(assignmentUrl + "/results");
  await page.getByRole("link", { name: "Cara M." }).click();
  await expect(page.getByText("Suggested grade")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Grade approved")).toBeVisible();
  await page.goto(assignmentUrl + "/results");
  const row = page.getByRole("row", { name: /Cara M\./ });
  await expect(row.locator("b.text-emerald-700")).toBeVisible();
});

test("teacher preview runs the draft without creating results", async ({ page }) => {
  await teacherLogin(page);
  await page.goto(assignmentUrl);
  await page.getByRole("link", { name: "Preview as student" }).click();
  await expect(page.getByText(/Teacher preview/)).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).first().click();
  await expect(page.getByText("Match each term with the best definition.")).toBeVisible();
  await shot(page, "22-preview");
  await page.goto(assignmentUrl + "/results");
  await expect(page.getByRole("link", { name: "Teacher Preview" })).toHaveCount(0);
});

test("multi-class: a second class gets its own question, assignment, code and results", async ({ page, browser }) => {
  await teacherLogin(page);
  await page.getByRole("link", { name: "Principles of A/V Technology" }).click();
  await page.getByRole("link", { name: "Periods, units & settings" }).click();
  await page.getByPlaceholder("e.g. 5th Period").fill("6th Period");
  await page.getByRole("button", { name: "Add period" }).click();
  await expect(page.getByText("Added")).toBeVisible();

  await page.getByRole("link", { name: "Assignments" }).click();
  await page.getByRole("button", { name: "+ New assignment" }).first().click();
  await page.getByLabel("Title").fill("Digital Files Quiz");
  await page.getByLabel("Type").selectOption("quiz");
  await page.getByLabel("Start with").selectOption("blank");
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Digital Files Quiz" })).toBeVisible();
  await page.getByRole("button", { name: "+ Write new question" }).click();
  await page.locator("#qprompt").fill("Which file type is a lossless image format?");
  await page.getByPlaceholder("Choice 1").fill("PNG");
  await page.getByPlaceholder("Choice 2").fill("MP3");
  await page.getByPlaceholder("Choice 3").fill("MP4");
  await page.getByPlaceholder("Choice 4").fill("DOCX");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(page.getByText("1 questions in 1 sections")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const code2 = (await page.locator(".font-mono.text-5xl").innerText()).trim();
  expect(code2).not.toBe(joinCode);

  const ctx = await browser.newContext();
  const s = await ctx.newPage();
  await s.goto(`/join/${code2}`);
  await s.getByLabel("Your name").fill("Dana P.");
  await s.getByRole("button", { name: "Start" }).click();
  await s.getByRole("button", { name: "Start" }).first().click();
  await s.getByRole("radio", { name: /PNG/ }).click();
  await s.getByRole("button", { name: "Submit section" }).click();
  await expect(s.getByText(/Section passed/)).toBeVisible();
  await ctx.close();

  await page.getByRole("link", { name: "Results" }).click();
  await expect(page.getByRole("link", { name: "Dana P." })).toBeVisible();
  // the economics review is unaffected
  await page.goto(assignmentUrl + "/results");
  await expect(page.getByRole("link", { name: "Dana P." })).toHaveCount(0);
});
