// app/history/page.tsx
//
// A log of past meals, grouped by week. Turns the app from "plan this week,
// then reset" into something with real continuity. All the underlying data
// already existed in meal_history from the feedback loop — this is purely
// a display layer, no new writes.

export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

interface HistoryEntry {
  id: string;
  date: string;
  status: string;
  rating: number | null;
  meals: { name: string; image_url: string | null; tags: string[] } | null;
}

function getMonday(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(weekStart + "T00:00:00");
  return `Week of ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
}

function dayName(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return DAY_NAMES[date.getDay()];
}

async function getHistory(): Promise<HistoryEntry[]> {
  const { data } = await supabase
    .from("meal_history")
    .select("id, date, status, rating, meals(name, image_url, tags)")
    .order("date", { ascending: false })
    .limit(200);

  return (data as any) ?? [];
}

export default async function HistoryPage() {
  const entries = await getHistory();

  const weeks = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const weekStart = getMonday(entry.date);
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart)!.push(entry);
  }
  const sortedWeeks = Array.from(weeks.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <main className="min-h-screen bg-white px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">History</h1>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/45">Everything you've cooked, skipped, and rated.</p>
        </header>

        {sortedWeeks.length === 0 && (
          <p className="text-sm text-[#1A1A1A]/45">
            Nothing logged yet — rate or skip a meal and it'll show up here.
          </p>
        )}

        <div className="space-y-8">
          {sortedWeeks.map(([weekStart, weekEntries]) => (
            <div key={weekStart}>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40">
                {formatWeekLabel(weekStart)}
              </h2>
              <div className="divide-y divide-[#1A1A1A]/8">
                {weekEntries
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((entry) => {
                    const meal = entry.meals;
                    return (
                      <div key={entry.id} className="flex items-center gap-3 py-3">
                        {meal?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={meal.image_url} alt={meal.name} className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1A1A1A]/5 text-lg">
                            🍽️
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40">
                            {dayName(entry.date)}
                          </p>
                          <p className="truncate text-sm font-bold text-[#1A1A1A]">{meal?.name ?? "Unknown meal"}</p>
                        </div>
                        <div className="shrink-0 text-base">
                          {entry.status === "skipped"
                            ? "⏭️"
                            : entry.rating !== null && entry.rating >= 4
                            ? "👍"
                            : entry.rating !== null && entry.rating <= 2
                            ? "👎"
                            : "✓"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
