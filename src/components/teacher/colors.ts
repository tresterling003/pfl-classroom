export const COURSE_COLORS = ["indigo", "emerald", "sky", "violet", "amber", "rose", "teal", "slate"] as const;

const DOT: Record<string, string> = {
  indigo: "bg-indigo-500", emerald: "bg-emerald-500", sky: "bg-sky-500", violet: "bg-violet-500",
  amber: "bg-amber-500", rose: "bg-rose-500", teal: "bg-teal-500", slate: "bg-slate-500",
};
const BAND: Record<string, string> = {
  indigo: "from-indigo-500 to-indigo-600", emerald: "from-emerald-500 to-teal-600", sky: "from-sky-500 to-blue-600", violet: "from-violet-500 to-purple-600",
  amber: "from-amber-400 to-orange-500", rose: "from-rose-500 to-pink-600", teal: "from-teal-500 to-cyan-600", slate: "from-slate-500 to-slate-700",
};
export const colorDot = (c: string) => DOT[c] ?? DOT.indigo;
export const colorBand = (c: string) => BAND[c] ?? BAND.indigo;
