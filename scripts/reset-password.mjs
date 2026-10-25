// Reset a teacher's password from the command line (e.g. if you forget it).
//   npm run teacher:reset-password -- you@school.org
// Works with your cloud database (DATABASE_URL) or the local embedded one.
import path from "node:path";
import readline from "node:readline";
import bcrypt from "bcryptjs";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run teacher:reset-password -- you@school.org");
  process.exit(1);
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((res) => {
    // hide typed characters
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(q) ? s : "*");
    rl.question(q, (a) => { rl.close(); process.stdout.write("\n"); res(a); });
  });
}

const pw = await ask("New password (10+ characters, letters and a number): ");
if (pw.length < 10 || !/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) {
  console.error("Password too weak. Use 10+ characters with at least one letter and one number.");
  process.exit(1);
}
const hash = await bcrypt.hash(pw, 11);

let run, close;
if (process.env.DATABASE_URL) {
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  run = async (q, params) => (await sql.unsafe(q, params)).length;
  close = () => sql.end();
} else {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(process.env.PGLITE_DIR ?? path.join((await import("node:os")).homedir(), ".pfl-classroom", "pglite"));
  run = async (q, params) => (await db.query(q, params)).affectedRows ?? 0;
  close = () => db.close();
}
const n = await run("update teachers set password_hash = $1 where email = $2", [hash, email]);
if (n) await run("delete from teacher_sessions where teacher_id in (select id from teachers where email = $1)", [email]);
await close();
console.log(n ? `Password updated for ${email}. Sign in with the new password.` : `No teacher found with email ${email}.`);
process.exit(n ? 0 : 1);
