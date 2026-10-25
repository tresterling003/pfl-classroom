import { redirect } from "next/navigation";
import { setupCodeRequired, teacherCount } from "@/lib/setup";
import { SetupForm } from "./SetupForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-time setup" };

export default async function SetupPage() {
  if ((await teacherCount()) > 0) redirect("/login");
  const needCode = setupCodeRequired();
  const codeConfigured = !!process.env.TEACHER_SETUP_CODE;
  return (
    <main className="flex min-h-screen items-center justify-center bg-grid px-4 py-10">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-ink-200 bg-white p-8 shadow-xl">
        <div className="flex items-center gap-2 text-lg font-extrabold text-ink-900">
          <Logo /> PFL Classroom
        </div>
        <h1 className="mt-6 text-2xl font-extrabold text-ink-900">Welcome! Create your teacher account</h1>
        <p className="mt-2 text-[15px] text-ink-600">This page only works once. After your account exists, it turns into the sign-in page.</p>
        {needCode && !codeConfigured ? (
          <p className="mt-5 rounded-xl bg-amber-50 p-4 text-[15px] text-amber-900">
            For security, setup needs a <b>TEACHER_SETUP_CODE</b>. Add it in your hosting settings (Vercel → Project → Settings → Environment Variables), redeploy, then reload this page.
          </p>
        ) : (
          <SetupForm needCode={needCode} />
        )}
      </div>
    </main>
  );
}
