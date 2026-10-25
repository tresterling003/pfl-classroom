import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { attemptFromToken, getJoinInfo, studentCookieName } from "@/lib/services/student";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let info: Awaited<ReturnType<typeof getJoinInfo>> | null = null;
  try {
    info = await getJoinInfo(code);
  } catch {
    info = null;
  }
  if (!info) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-grid px-4">
        <div className="max-w-md rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-xl">
          <h1 className="text-2xl font-extrabold text-ink-900">Code not found</h1>
          <p className="mt-2 text-ink-600">
            We couldn&apos;t find an activity with the code <b className="font-mono">{code.toUpperCase()}</b>. Check the code with your teacher.
          </p>
          <Link href="/" className="mt-6 inline-block rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
            Try another code
          </Link>
        </div>
      </main>
    );
  }
  const token = (await cookies()).get(studentCookieName(info.assignmentId))?.value;
  if (token) {
    const { attempt } = await attemptFromToken(code, token);
    if (attempt) redirect(`/play/${info.code}`);
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-grid px-4 py-10">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-ink-200 bg-white p-7 shadow-xl shadow-brand-900/5 sm:p-8">
        <div className="text-sm font-semibold text-brand-700">{info.courseName}</div>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight text-ink-900">{info.title}</h1>
        {!info.open && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 font-medium text-amber-900">{info.reason}</p>}
        <JoinForm code={info.code} periods={info.periods} open={info.open} />
      </div>
    </main>
  );
}
