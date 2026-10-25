import { requireTeacherPage } from "@/lib/auth";
import { aiConfigured, aiModel } from "@/lib/grading/ai";
import { SettingsClient } from "./SettingsClient";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const t = await requireTeacherPage();
  return <SettingsClient name={t.name} email={t.email} ai={{ on: aiConfigured(), model: aiConfigured() ? aiModel() : null }} db={process.env.DATABASE_URL ? "cloud" : "local"} />;
}
