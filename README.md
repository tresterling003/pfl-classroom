# PFL Classroom

An interactive review, quiz and test platform for the classroom. It supports many classes and unlimited assignments, grades automatically, and lets students progress section by section.

- **Teachers** build questions once in a per-class **question bank**, organize them into **assignments** (reviews, quizzes, practice sets, tests), publish with a **join code**, watch results **live**, review short answers, and **export grades to CSV**.
- **Students** open a link or type a code, enter their name and period, and work on any device (Chromebook, Windows, iPad, phone). They don't need accounts. Work autosaves. They must reach the passing score on a section to unlock the next one.

The platform comes preloaded with **Economics Unit Review — Markets, Circular Flow, Supply & Demand** (40 questions), ready for you to inspect and publish.

| Guide | For |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | Putting the site online (step by step, no coding) |
| [docs/TEACHER_GUIDE.md](docs/TEACHER_GUIDE.md) | Using it every week: classes, questions, assignments, grading |
| [docs/question-template.csv](docs/question-template.csv) | Spreadsheet template for importing questions |

---

## Try it on your computer (5 minutes)

You need [Node.js 20 or newer](https://nodejs.org) (the "LTS" download). Then, in a terminal inside this folder:

```bash
npm install
npm run dev
```

Open http://localhost:3000/teacher. On first visit you'll create your teacher account (no setup code is needed locally). Your data is stored in a `.pfl-classroom` folder in your home directory; nothing else needs to be installed.

Student join page: http://localhost:3000. Use the code shown after you publish an assignment.

---

## How it's built (and why)

| Piece | Choice | Why |
|---|---|---|
| App | **Next.js 16 + TypeScript** | One codebase for pages and the server API; huge community; free hosting on Vercel |
| Styling | **Tailwind CSS** | Consistent, accessible design without extra libraries |
| Database | **PostgreSQL** via **Drizzle ORM** | Reliable, standard SQL with real constraints and transactions. In production it uses **Neon** (free tier) or any Postgres. Locally it uses an embedded Postgres (PGlite), so there's nothing to install. |
| Hosting | **Vercel** | Connect GitHub and every push deploys. Free tier is plenty for a classroom. |
| Teacher auth | Built-in email + password (bcrypt, httpOnly session cookies) | No extra service to configure; works offline locally |
| Short-answer AI (optional) | Anthropic Claude, server-side only | Off by default; falls back to rubric grading |

### Data model

```
Teacher ─┬─ Course (class) ─┬─ Period
         │                  ├─ Unit
         │                  ├─ Question (question bank)
         │                  └─ Assignment ─┬─ Section ── SectionQuestion → Question   (editable draft)
         │                                 ├─ AssignmentPeriod
         │                                 └─ AssignmentVersion (frozen snapshot on publish)
         │                                        └─ Attempt (one per student) ─ SectionRun (each try) ─ Response
```

- **Editing never changes past grades.** Publishing freezes a complete copy of the assignment, including the answer keys, as a *version*. Each student is graded against the version they started. Later edits go into a new version only when you publish again.
- Classes, assignments and question banks are fully independent. Duplicating an assignment or a whole class never copies student work.

### Security & privacy

- All grading happens on the server. Students never receive answer keys, rubrics or explanations before they submit. Matching choices use random per-attempt tokens, so the page source reveals nothing.
- Students identify with **name + period only**. Each student's browser gets a random secret (an httpOnly cookie, stored only as a SHA-256 hash). Another student who types the same name can't open that work without the student's private **resume code**.
- Teacher pages and APIs need a signed-in teacher, and every query checks that the teacher owns that class.
- Database-backed rate limits cover sign-in, join, resume codes and student actions. Every input is validated, cross-site POSTs are blocked, CSV exports are protected against formula injection, and security headers are set.
- First-run setup in production needs `TEACHER_SETUP_CODE`, so a stranger can't claim your new site.
- The database is never exposed to browsers. There are no public database rules; all access goes through the server.
- Retention tools: delete one student's work, all results for an assignment, or everything older than a date. Backups export as JSON.

### Grading model

- **Pass mark ≠ grade.** Reaching 70% unlocks the next section. The *grade* is the actual score from the try you chose to count (best, latest or first).
- Default: each section is worth an equal share of 100 points, and questions within a section count equally.
- The results page shows completion, passing status, the **suggested grade** and your **teacher-approved grade** separately. The CSV's "Gradebook Grade" uses your approved grade when one is set.
- Fill-in-the-blank ignores capitalization, punctuation, extra spaces, leading "the/a", simple plurals, `$`/units on numbers, and small typos on long words. It never fuzzes numbers or opposite words (increase/decrease, upward/downward). You can block specific wrong answers and "accept for everyone" after the fact.
- Short answers get partial credit per rubric idea. Rubric scores are always **provisional**, and uncertain answers are flagged for review. A student is never locked out because the auto-grader was unsure ("provisional" progression).

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run locally at http://localhost:3000 |
| `npm test` | Grading, scoring, security and full-flow tests (in-memory database) |
| `npm run test:e2e` | Browser tests: teacher setup → publish → students on Chromebook-size screens → results → CSV |
| `npm run build` | Apply database migrations, then build for production (Vercel runs this) |
| `npm run db:migrate` | Apply database migrations to `DATABASE_URL` |
| `npm run teacher:reset-password -- you@school.org` | Reset a forgotten password |
| `npm run lint` / `npm run typecheck` | Code checks |

### Project layout

```
src/
  app/                 pages + API routes
    teacher/…          teacher dashboard (classes, bank, builder, results, review, settings)
    join/, play/       student join + player
    api/               server endpoints (teacher/*, s/[code], join, auth/*)
  components/          UI (player/, teacher/, shared ui.tsx)
  db/                  schema.ts (tables) + connection
  lib/
    grading/           normalize, objective (FIB/MC/matching), rubric, ai
    scoring.ts         pass/fail, best/latest/first, section weights
    services/          all server logic with ownership checks
    seed/              the built-in Economics review
drizzle/               SQL migrations
tests/                 unit, integration, e2e
```

### Changing the database schema

Edit `src/db/schema.ts`, run `npm run db:generate` to create a migration in `drizzle/`, and commit it. Migrations run automatically on the next deploy.
