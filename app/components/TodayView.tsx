// app/components/TodayView.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { normalizeSteps } from "../lib/steps";
import CookingMode from "./CookingMode";

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

interface Meal {
  id?: string;
  day: string;
  name: string;
  ingredients: Ingredient[];
  instructions: any[]; // legacy string[] or new {title,content,timer_seconds}[] — normalizeSteps() handles both
  tags: string[];
  image_url?: string | null;
}

interface DayEntry {
  day: string;
  meal: Meal;
}

const ACCENTS = [
  { name: "coral", bg: "#FF6B5A", soft: "#FFEEEC" },
  { name: "sunflower", bg: "#F5A623", soft: "#FFF6E5" },
  { name: "sky", bg: "#4A9DE0", soft: "#EAF4FC" },
  { name: "sage", bg: "#5FA88A", soft: "#EAF5F0" },
  { name: "plum", bg: "#9B6BE5", soft: "#F3EDFC" },
  { name: "rose", bg: "#F2739E", soft: "#FDECF2" },
  { name: "teal", bg: "#3EB0A8", soft: "#E8F7F5" },
];

const ALL_DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

export default function TodayView({
  week,
  todayName,
}: {
  week: DayEntry[] | null;
  todayName: string;
}) {
  const defaultDay =
    week?.find((d) => d.day === todayName)?.day ?? week?.[0]?.day ?? null;
  const [selectedDay, setSelectedDay] = useState<string | null>(defaultDay);
  const [ratedMeals, setRatedMeals] = useState<Record<string, "cooked" | "skipped">>({});
  const [error, setError] = useState<string | null>(null);
  const [cookingMode, setCookingMode] = useState(false);

  async function handleFeedback(mealId: string | undefined, status: "cooked" | "skipped", rating: number | null) {
    if (!mealId) return;
    try {
      await fetch("/api/meal-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal_id: mealId, status, rating }),
      });
      setRatedMeals((prev) => ({ ...prev, [mealId]: status }));
    } catch {
      setError("Couldn't save that feedback. Try again.");
    }
  }

  if (!week || week.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F7F6F2] px-5">
        <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-2xl font-extrabold text-[#1C1C1E]">
            No plan yet 🍽️
          </h1>
          <p className="mb-6 text-sm text-[#1C1C1E]/50">
            Nothing planned for this week. Head to the planner to generate one.
          </p>
          <Link
            href="/plan"
            className="inline-block rounded-full bg-[#1C1C1E] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02]"
          >
            Plan this week →
          </Link>
        </div>
      </main>
    );
  }

  const entry = week.find((d) => d.day === selectedDay);
  const dayIndex = ALL_DAYS.indexOf(selectedDay ?? "");
  const todayIndex = ALL_DAYS.indexOf(todayName);
  const accent = ACCENTS[dayIndex >= 0 ? dayIndex % ACCENTS.length : 0];
  const isToday = selectedDay === todayName;
  const isPast = dayIndex >= 0 && todayIndex >= 0 && dayIndex < todayIndex;

  let subtitle: string;
  if (isToday) {
    subtitle = "What you're cooking today.";
  } else if (isPast) {
    subtitle = `Looking back at ${selectedDay}.`;
  } else {
    subtitle = `Coming up on ${selectedDay}.`;
  }

  return (
    <main className="min-h-screen bg-[#F7F6F2] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E]">
              {isToday ? "Tonight" : selectedDay} 🍽️
            </h1>
            <p className="mt-1 text-sm text-[#1C1C1E]/50">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/history"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1C1C1E]/50 shadow-sm transition-all hover:text-[#1C1C1E]/70 hover:shadow-md"
            >
              📅 History
            </Link>
            <Link
              href="/plan"
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1C1C1E]/50 shadow-sm transition-all hover:text-[#1C1C1E]/70 hover:shadow-md"
            >
              ↺ Restart week
            </Link>
          </div>
        </header>

        {/* Day picker strip */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
          {week.map(({ day }, i) => {
            const dColor = ACCENTS[i % ACCENTS.length];
            const active = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className="shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all"
                style={
                  active
                    ? { backgroundColor: dColor.bg, color: "white" }
                    : { backgroundColor: "white", color: "#1C1C1E80" }
                }
              >
                {day.slice(0, 3)}
                {day === todayName && " •"}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-[#FF6B5A]/10 px-5 py-3.5 text-sm font-medium text-[#D14A3A]">
            {error}
          </div>
        )}

        {entry && (
          <div className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-bold text-[#1C1C1E]">{entry.meal.name}</h2>
              <div className="flex gap-1.5">
                {entry.meal.tags?.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ backgroundColor: accent.soft, color: accent.bg }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {entry.meal.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.meal.image_url}
                alt={entry.meal.name}
                className="mb-5 h-72 w-full rounded-2xl object-cover shadow-sm"
              />
            )}

            <div
              className="grid gap-6 rounded-2xl p-5 sm:grid-cols-2"
              style={{ backgroundColor: accent.soft }}
            >
              <div>
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: accent.bg }}>
                  Ingredients
                </h3>
                <ul className="space-y-1.5 text-sm text-[#1C1C1E]/80">
                  {entry.meal.ingredients.map((ing, i) => (
                    <li key={i}>
                      {ing.quantity} {ing.unit} {ing.name}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide" style={{ color: accent.bg }}>
                  Instructions
                </h3>
                <ol className="space-y-2.5 text-sm text-[#1C1C1E]/80">
                  {normalizeSteps(entry.meal.instructions).map((step, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="font-bold" style={{ color: accent.bg }}>{i + 1}</span>
                      <span>
                        <span className="font-semibold text-[#1C1C1E]">{step.title}.</span>{" "}
                        {step.content}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <button
              onClick={() => setCookingMode(true)}
              className="mt-5 rounded-full px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg"
              style={{ backgroundColor: accent.bg }}
            >
              👨‍🍳 Start cooking mode
            </button>

            {entry.meal.id && ratedMeals[entry.meal.id] ? (
              <p className="mt-5 text-sm font-semibold text-[#1C1C1E]/40">
                {ratedMeals[entry.meal.id] === "skipped"
                  ? "Marked as skipped — won't suggest this again soon."
                  : "Thanks — noted for next time."}
              </p>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => handleFeedback(entry.meal.id, "cooked", 5)}
                  className="rounded-full bg-[#F7F6F2] px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 transition-all hover:bg-[#EDECE7]"
                >
                  👍 Loved it
                </button>
                <button
                  onClick={() => handleFeedback(entry.meal.id, "cooked", 1)}
                  className="rounded-full bg-[#F7F6F2] px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 transition-all hover:bg-[#EDECE7]"
                >
                  👎 Not for me
                </button>
                <button
                  onClick={() => handleFeedback(entry.meal.id, "skipped", null)}
                  className="rounded-full bg-[#F7F6F2] px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 transition-all hover:bg-[#EDECE7]"
                >
                  ⏭️ Skipped it
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {cookingMode && entry && (
        <CookingMode
          steps={normalizeSteps(entry.meal.instructions)}
          mealName={entry.meal.name}
          onClose={() => setCookingMode(false)}
        />
      )}
    </main>
  );
}
