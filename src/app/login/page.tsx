import { redirect } from "next/navigation";
import { getTeacher } from "@/lib/auth";
import { teacherCount } from "@/lib/setup";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teacher sign in" };

export default async function LoginPage() {
  if (await getTeacher()) redirect("/teacher");
  if ((await teacherCount()) === 0) redirect("/setup");
  return (
    <main className="flex min-h-screen items-center justify-center bg-grid px-4">
      <div className="w-full max-w-sm animate-pop rounded-3xl border border-ink-200 bg-white p-8 shadow-xl">
        <div className="flex items-center gap-2 text-lg font-extrabold text-ink-900">
          <Logo /> PFL Classroom
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-ink-900">Teacher sign in</h1>
        <LoginForm />
      </div>
    </main>
  );
}
