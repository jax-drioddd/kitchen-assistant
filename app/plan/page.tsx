// app/plan/page.tsx — the full week planner: onboarding, generation,
// chat-based refinement, and grocery list. Moved here from the homepage;
// "/" is now the fast Today view for day-to-day use.

export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import Dashboard from "../components/Dashboard";

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

export default async function PlanPage() {
  const week = await getCurrentWeek();
  return <Dashboard initialWeek={week} />;
}
