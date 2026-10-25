# Putting PFL Classroom online

This takes about 20–30 minutes, once. You'll create three free accounts: **GitHub** (stores the code), **Vercel** (runs the website) and **Neon** (stores the data; created from inside Vercel). You never need to edit code.

> **What could cost money?** Nothing, if you stay on the free plans below and leave AI grading off.
> - Vercel "Hobby" plan: free. It's intended for personal, non-commercial projects; a teacher's own classroom tool fits that. If your district wants a formal contract, Vercel Pro is $20/month.
> - Neon Postgres free plan: 0.5 GB of storage, which is years of classroom data. After about 5 idle minutes the database sleeps, so the first page load afterwards takes 1–2 seconds longer.
> - Optional AI short-answer grading is paid per answer. See step 7.

---

## 1. Put the code on GitHub

1. Create a free account at https://github.com (skip this if you have one).
2. Create a **new private repository** named `pfl-classroom`. Don't add a README; leave it empty.
3. Get the code into it, using **one** of these:
   - **Ask Claude to push it for you:** connect that repository to your Claude Code session, then say "push the PFL Classroom code to my repo".
   - **GitHub Desktop** (no typing): install https://desktop.github.com, choose *File → Add local repository* and pick the `pfl-classroom` folder, then *Publish*.
   - **Terminal:** in the project folder, run
     ```bash
     git remote add origin https://github.com/YOUR-USERNAME/pfl-classroom.git
     git push -u origin main
     ```

## 2. Create the website on Vercel

1. Go to https://vercel.com/signup and choose **Continue with GitHub**.
2. Click **Add New… → Project**, find `pfl-classroom` and click **Import**.
3. **Don't click Deploy yet.** First open **Environment Variables** on that same screen and add:

   | Name | Value |
   |---|---|
   | `TEACHER_SETUP_CODE` | A long phrase only you know, e.g. `purple-hawk-ledger-42`. You'll type it once in step 5. |

4. Click **Deploy**. The build finishes, but the site won't work until it has a database. That comes next.

## 3. Add the database (Neon, free)

1. In your Vercel project, open the **Storage** tab, then **Create Database → Neon (Serverless Postgres)** (it may be listed under *Marketplace*).
2. Choose the **Free** plan and the region closest to where your Vercel site runs (Vercel's default is Washington, D.C., so pick *US East*), then **Create**.
3. When asked, **connect it to the `pfl-classroom` project** for all environments. Vercel adds `DATABASE_URL` for you automatically.

## 4. Deploy again

Open the **Deployments** tab, click the **⋯** menu on the newest deployment, and choose **Redeploy**. Every build automatically creates and updates the database tables (migrations). Wait for **Ready**.

## 5. Create your teacher account

1. Visit `https://YOUR-PROJECT.vercel.app/setup`. Vercel shows the exact address on the project page.
2. Enter your setup code, your name, email and a password (10+ characters with a letter and a number).
3. Leave **Add starter content** on. This creates your *PFL / Economics* class with the 40-question Economics Unit Review (unpublished), plus two empty example classes you can rename or delete.

The setup page works only once. Afterwards, sign in at `/login`. Bookmark `https://YOUR-PROJECT.vercel.app/teacher`.

## 6. Check it works on a Chromebook

1. Open the review, click **Preview as student**, and try a section.
2. Press **Publish**. The **Share & publish** tab shows the join code and link.
3. On a student Chromebook, open `https://YOUR-PROJECT.vercel.app` and type the code.

> **School web filter:** Some districts block new websites. If students see a "blocked" page, ask your tech department to allow `YOUR-PROJECT.vercel.app`. You can also attach your own domain in Vercel → Settings → Domains.

**Your links**
- Teacher: `https://YOUR-PROJECT.vercel.app/teacher`
- Students: `https://YOUR-PROJECT.vercel.app`, then they type the code (or you share `…/join/CODE`)

## 7. Optional: AI-assisted short-answer grading

Without AI, short answers are scored with your rubric phrases and marked **provisional** for your review, which works well. AI grading judges meaning more flexibly. Its scores are still only suggestions you approve.

1. Create an API key at https://console.anthropic.com (requires a payment method).
2. In Vercel → Settings → Environment Variables, add:

   | Name | Value |
   |---|---|
   | `AI_PROVIDER` | `anthropic` |
   | `ANTHROPIC_API_KEY` | your key (never share it or paste it in chat) |
   | `AI_MODEL` | optional; leave empty for `claude-opus-5-5`, or `claude-haiku-5-5` for much lower cost |

3. Redeploy (step 4).

**Rough cost** (a 30-student class doing a 10-question short-answer section, about 450 graded answers with retries): about **$4–5** with the default model, or about **$0.15** with `claude-haiku-5-5`. Check current prices at https://www.anthropic.com/pricing. Set a monthly spend limit in the Anthropic console.

The key lives only on the server. Students can never see it.

---

## Everyday maintenance

- **Updates:** when code changes are pushed to GitHub, Vercel redeploys automatically and applies any database changes.
- **Backups:** each class has *Periods, units & settings → Download backup*. Neon also keeps its own point-in-time history.
- **Forgot your password?** On your computer, in the project folder, set `DATABASE_URL` to the value from Vercel (Settings → Environment Variables) and run:
  ```bash
  DATABASE_URL="postgres://…" npm run teacher:reset-password -- you@school.org
  ```
  The new password is typed privately in the terminal.
- **End of year:** export grades, then *Settings & privacy → Data retention* deletes old student work. To reuse everything, use *Duplicate class*; it copies questions and assignments but never students.

## Using Supabase or another Postgres instead of Neon

Any PostgreSQL 14+ works. Set `DATABASE_URL` to its connection string; for Supabase, use the **transaction pooler** string on port 6543. Free Supabase projects pause after a week without use, which is why Neon is recommended.

## Running locally

```bash
npm install
npm run dev        # http://localhost:3000, embedded database in ~/.pfl-classroom
npm test           # automated tests
```
