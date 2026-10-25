# Teacher guide

## The big picture

```
Classes  →  Units  →  Assignments  →  Sections  →  Questions (from the class question bank)
```

- Each **class** (PFL / Economics, A/V Technology, Digital Arts…) has its own periods, units, question bank, assignments and gradebook.
- A **question** lives in the class's **question bank**. You write it once and reuse it in any number of assignments.
- An **assignment** is a review, quiz, practice set or test made of **sections**. Each section has its own pass mark, and can serve a random subset of its questions.
- **Publishing** freezes a copy for students and gives the assignment a **join code**. Editing later won't change anyone's grade until you publish again, and even then only new students get the new version.

## Weekly workflow

1. **Write or import questions.** *Class → Question bank → + New question*, or *Import* a spreadsheet (see below).
2. **Build the assignment.** *Class → Assignments → + New assignment* and pick a type:
   - **Review**: sections unlock at 70%, unlimited retries, best try counts (the Economics review uses this)
   - **Quiz**: one graded try, answers shown after it closes
   - **Practice**: instant feedback on each question
   - **Test**: no feedback; students only see "submitted"

   Then add questions to each section with **+ Add from question bank** or **+ Write new question**. Reorder with ↑ ↓.
3. **Check the settings** (*Settings & rules* tab): pass %, graded tries, which try counts (best, latest or first), when explanations and correct answers appear, open and close dates, and which periods.
4. **Preview as student** to try it exactly as students will.
5. **Publish.** Put the code on the board (*Share & publish* tab shows it large) or post the link in Google Classroom.
6. **Watch live.** *Results* updates every 15 seconds: who's working, who's done, section scores, tries, time spent.
7. **Review short answers.** *Needs review* lists answers the auto-grader wasn't sure about. Give 0, half or full credit (or any score), add feedback, or accept the suggestion. Scores and pass/fail recalculate instantly.
8. **Approve and export.** On *Results*, **Approve ready grades** confirms the suggested grade for completed students with nothing left to review. Click any student to set a different grade. Then **Export grades (CSV)** for one period or all, and copy the "Gradebook Grade" column into your school gradebook.

## Understanding the numbers

| Term | Meaning |
|---|---|
| **Completion** | Not started / In progress / Completed (every section cleared) |
| **Passing status** | Whether each section reached the pass mark. Passing unlocks the next section. **It is not the grade.** |
| **Section %** | The score on the try that counts (best, latest or first, per your setting) |
| **Suggested grade** | Points earned out of the assignment total, computed automatically. A **\*** means it includes short-answer scores you haven't reviewed. |
| **Approved grade** | The grade you confirmed (or typed). The CSV's "Gradebook Grade" uses it when set; otherwise it uses the suggested grade. |

Example: a student scores 70% on Matching (passes and unlocks section 2), then 100%, 90% and 80%. With 4 equal sections worth 25 points each, the suggested grade is 17.5 + 25 + 22.5 + 20 = **85**, not 100.

## Fill-in-the-blank answers

Capitalization, punctuation, extra spaces, "the/a", simple plurals, `$` and units on numbers, and small spelling slips on longer words are always forgiven. "resource market", "Resource Market" and "the resource markets" all count.

- Add other acceptable wordings under **Accepted answers**.
- Add tempting wrong answers under **Wrong answers to block** (for example, "product market" when the answer is "resource market").
- Use **Test a student answer** in the editor to check before publishing.
- Missed a valid answer after students submitted? *Results → Question analysis* lists common wrong answers. Click **accept** to give credit to everyone who typed it.

## Writing good short-answer rubrics

Each rubric **idea** earns its points. For each idea, list a few **ways students might say it**, one per line. A line counts when all of its important words appear in the answer, in any order. Capitalization doesn't matter, and small typos in longer words are fine.

```
Idea: When price goes up, quantity demanded goes down   [2 points]
  price goes up buy less
  higher price fewer
  price rises buy less
  cheaper buy more
```

Tips:
- Keep lines short (2–4 key words). Write several alternatives rather than one long sentence.
- Add **misconceptions** (for example, "demand curve slopes upward") so those answers get flagged for you.
- Paste real student answers into **Test a student answer** and add the phrasings you see.
- Automatic short-answer scores are always labeled *suggested*. You have the final say.

## Matching questions

Each matching question is one term plus its correct definition. All matching questions placed next to each other in a section appear together as one board, so the other definitions act as the wrong choices. Each match is graded separately. Use **Extra distractors** to add more wrong choices.

## Importing questions from a spreadsheet

Use [question-template.csv](question-template.csv), or export your bank as CSV to get a filled-in example. Columns:

| Column | What to put |
|---|---|
| Type | `Matching`, `Fill in the Blank`, `Multiple Choice` or `Short Answer` |
| Question | The question (for matching: the term). For fill-in-the-blank, put `___` where the blank goes. |
| Correct Answer | The right answer (matching: the definition; short answer: an example full-credit answer) |
| Other Choices / Alternatives | MC: wrong choices; FIB: other accepted answers; matching: extra distractors. Separate with ` \| ` |
| Rejected Answers | FIB only: answers to always mark wrong, separated with ` \| ` |
| Rubric | Short answer only: `Idea text [points] = phrase; phrase \|\| Next idea [points] = phrase; phrase` |
| Explanation, Topic, Difficulty, Points, Unit | Optional. A new unit is created if the name doesn't exist. |

Import checks every row first and imports nothing if a row has a problem. It tells you which rows to fix.

## Students

- Students type their **name** (first name + last initial) and pick their **period**. No accounts or emails.
- If a Chromebook refreshes, closes or loses Wi-Fi, work is kept, both on the device and on the server. The top of the screen always shows whether work is saved.
- **Switching computers:** students tap *Switching devices?* to see a private 6-character **resume code**. On the new computer they type the same name and that code. You can also see each student's code on their results page.
- If someone else types a name that's already in use, they're asked for the resume code, so they can't open or change another student's work.
- Student typed the wrong name or needs a fresh start? Open their results page and choose **Reset / delete**.

## Reusing everything next year

- **Duplicate an assignment** (to the same class or another class): you get a new draft with a new code and no student results. Questions are copied into the other class's bank if needed.
- **Duplicate a class** (*Periods, units & settings → New school year?*): copies units, the question bank and all assignments as drafts. No students are copied.
- **Archive** assignments, questions, periods and classes you're done with. Nothing is lost, and archived items come back with one click.
