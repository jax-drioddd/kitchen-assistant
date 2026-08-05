// app/page.tsx — the new homepage: "what am I cooking today"
//
// force-dynamic: same reasoning as before — this must never serve a stale
// cached snapshot of the week's meals.

export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import TodayView from "./components/TodayView";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_ORDER = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function getTodayName(d: Date): string {
  const idx = d.getDay(); // 0 = Sunday
  return DAY_ORDER[(idx + 6) % 7]; // shift so Monday = 0
}

async function getCurrentWeek() {
  const weekStart = getMonday(new Date());

  const { data: plan } = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("week_start", weekStart)
    .single();

  if (!plan) return null;

  const mealIds = Object.values(plan.days) as string[];
  const { data: meals } = await supabase
    .from("meals")
    .select("*")
    .in("id", mealIds);

  if (!meals) return null;

  const mealsById = Object.fromEntries(meals.map((m: any) => [m.id, m]));

  const entries = DAY_ORDER.map((day) => ({
    day,
    meal: mealsById[plan.days[day]],
  })).filter((d) => d.meal);

  return entries.length > 0 ? entries : null;
}

export default async function Home() {
  const week = await getCurrentWeek();
  const todayName = getTodayName(new Date());
  return <TodayView week={week} todayName={todayName} />;
}
