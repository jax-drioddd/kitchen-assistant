// app/history/page.tsx
//
// A log of past meals, grouped by week. Turns the app from "plan this week,
// then reset" into something with real continuity. All the underlying data
// already existed in meal_history from the feedback loop — this is purely
// a display layer, no new writes.

export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

const ACCENTS = [
  { name: "coral", bg: "#FF6B5A", soft: "#FFEEEC" },
  { name: "sunflower", bg: "#F5A623", soft: "#FFF6E5" },
  { name: "sky", bg: "#4A9DE0", soft: "#EAF4FC" },
  { name: "sage", bg: "#5FA88A", soft: "#EAF5F0" },
  { name: "plum", bg: "#9B6BE5", soft: "#F3EDFC" },
  { name: "rose", bg: "#F2739E", soft: "#FDECF2" },
  { name: "teal", bg: "#3EB0A8", soft: "#E8F7F5" },
];

interface HistoryEntry {
  id: string;
  date: string;
  status: string;
  rating: number | null;
  meals: {
    name: string;
    image_url: string | null;
    tags: string[];
  } | null;
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

  // Group entries by the Monday of their week
  const weeks = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const weekStart = getMonday(entry.date);
    if (!weeks.has(weekStart)) weeks.set(weekStart, []);
    weeks.get(weekStart)!.push(entry);
  }
  const sortedWeeks = Array.from(weeks.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <main className="min-h-screen bg-[#F7F6F2] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E]">
              History 📅
            </h1>
            <p className="mt-1 text-sm text-[#1C1C1E]/50">
              Everything you've cooked, skipped, and rated.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 shadow-sm hover:shadow-md"
          >
            ← Back
          </Link>
        </div>

        {sortedWeeks.length === 0 && (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-[#1C1C1E]/50">
              Nothing logged yet — rate or skip a meal and it'll show up here.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {sortedWeeks.map(([weekStart, weekEntries]) => (
            <div key={weekStart}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-[#1C1C1E]/40">
                {formatWeekLabel(weekStart)}
              </h2>
              <div className="space-y-2">
                {weekEntries
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((entry, i) => {
                    const accent = ACCENTS[i % ACCENTS.length];
                    const meal = entry.meals;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"
                        style={{ borderLeft: `4px solid ${accent.bg}` }}
                      >
                        {meal?.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={meal.image_url}
                            alt={meal.name}
                            className="h-12 w-12 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
                            style={{ backgroundColor: accent.bg }}
                          >
                            🍽️
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#1C1C1E]/40">
                            {dayName(entry.date)}
                          </p>
                          <p className="truncate text-sm font-bold text-[#1C1C1E]">
                            {meal?.name ?? "Unknown meal"}
                          </p>
                        </div>
                        <div className="shrink-0 text-lg">
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
