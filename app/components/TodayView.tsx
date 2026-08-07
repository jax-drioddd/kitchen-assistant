// app/components/TodayView.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { normalizeSteps, scaleIngredients, renderStepContent } from "../lib/steps";
import CookingMode from "./CookingMode";

interface Ingredient {
  id?: string;
  name: string;
  quantity: number;
  unit: string;
}

interface Meal {
  id?: string;
  day: string;
  name: string;
  ingredients: Ingredient[];
  instructions: any[];
  tags: string[];
  image_url?: string | null;
  base_servings?: number;
}

interface DayEntry {
  day: string;
  meal: Meal;
}

// One accent color, used sparingly — not a rainbow per day. This is the
// core restraint that makes Mela's design read as editorial rather than
// "playful app."
const ACCENT = "#E8674A";
const ACCENT_SOFT = "#FDEEE9";

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
  // Tracked as two separate pieces of state on purpose: cookedMealIds drives
  // whether the UI shows the rating stage (always true after a successful
  // call), while historyIdByMeal holds the id needed for the follow-up
  // rating update, which can legitimately be null. Keeping the UI
  // transition tied only to a Set membership check — instead of a truthy
  // check on a value that could come back null — means a missing history_id
  // can't silently leave the original buttons stuck on screen.
  const [cookedMealIds, setCookedMealIds] = useState<Set<string>>(new Set());
  const [historyIdByMeal, setHistoryIdByMeal] = useState<Record<string, string | null>>({});
  const [markingStatus, setMarkingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookingMode, setCookingMode] = useState(false);
  const [servingsOverride, setServingsOverride] = useState<Record<string, number>>({});
  const [inventoryNames, setInventoryNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/inventory")
      .then((res) => res.json())
      .then((data) => {
        const names = (data.items ?? []).map((i: any) => i.item.toLowerCase().trim());
        setInventoryNames(new Set(names));
      })
      .catch(() => {});
  }, []);

  async function handleMarkStatus(mealId: string | undefined, status: "cooked" | "skipped") {
    if (!mealId || markingStatus) return; // guard against rapid re-clicks firing multiple requests
    setMarkingStatus(true);
    setError(null);
    try {
      const res = await fetch("/api/meal-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal_id: mealId, status, rating: null }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      if (status === "skipped") {
        setRatedMeals((prev) => ({ ...prev, [mealId]: "skipped" }));
      } else {
        // Cooked, but not rated yet — inventory already depleted server-side.
        // The UI transition depends only on this Set membership, not on
        // history_id being truthy, so a null id can't leave the original
        // buttons stuck on screen.
        setCookedMealIds((prev) => new Set(prev).add(mealId));
        setHistoryIdByMeal((prev) => ({ ...prev, [mealId]: data.history_id ?? null }));
      }
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setMarkingStatus(false);
    }
  }

  async function handleRate(mealId: string | undefined, rating: number | null) {
    if (!mealId) return;
    const historyId = historyIdByMeal[mealId];
    try {
      if (historyId) {
        await fetch("/api/meal-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ history_id: historyId, rating }),
        });
      }
      setRatedMeals((prev) => ({ ...prev, [mealId]: "cooked" }));
    } catch {
      setError("Couldn't save that rating. Try again.");
    }
  }

  if (!week || week.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white dark:bg-[#121212] px-5">
        <div className="max-w-sm text-center">
          <h1 className="mb-2 text-2xl font-bold text-[#1A1A1A] dark:text-[#F0F0F0]">No plan yet</h1>
          <p className="mb-6 text-sm text-[#1A1A1A]/50 dark:text-[#F0F0F0]/50">
            Nothing planned for this week. Head to the planner to generate one.
          </p>
          <Link
            href="/plan"
            className="inline-block rounded-full px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
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
  const isToday = selectedDay === todayName;
  const isPast = dayIndex >= 0 && todayIndex >= 0 && dayIndex < todayIndex;

  let subtitle: string;
  if (isToday) subtitle = "What you're cooking today.";
  else if (isPast) subtitle = `Looking back at ${selectedDay}.`;
  else subtitle = `Coming up on ${selectedDay}.`;

  const baseServings = entry?.meal.base_servings ?? 2;
  const currentServings =
    entry?.meal.id != null ? servingsOverride[entry.meal.id] ?? baseServings : baseServings;

  function adjustServings(delta: number) {
    if (!entry?.meal.id) return;
    setServingsOverride((prev) => ({
      ...prev,
      [entry.meal.id!]: Math.max(1, currentServings + delta),
    }));
  }

  const steps = entry ? normalizeSteps(entry.meal.instructions) : [];
  const scaledIngredients = entry
    ? scaleIngredients(entry.meal.ingredients, baseServings, currentServings)
    : [];
  const inventoryMatchCount = entry
    ? entry.meal.ingredients.filter((ing) => inventoryNames.has(ing.name.toLowerCase().trim())).length
    : 0;

  return (
    <main className="min-h-screen bg-white dark:bg-[#121212] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A] dark:text-[#F0F0F0]">
            {isToday ? "Tonight" : selectedDay}
          </h1>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/45 dark:text-[#F0F0F0]/45">{subtitle}</p>
        </header>

        {/* Day picker — plain text rows, solid highlight only on the active day */}
        <div className="mb-8 flex gap-1 overflow-x-auto pb-1">
          {week.map(({ day }) => {
            const active = day === selectedDay;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  !active ? "text-[#1A1A1A]/70 dark:text-[#F0F0F0]/70" : ""
                }`}
                style={active ? { backgroundColor: ACCENT, color: "white" } : undefined}
              >
                {day.slice(0, 3)}
                {day === todayName && !active && " ·"}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {entry && (
          <div>
            <h2 className="mb-2 text-3xl font-bold leading-tight text-[#1A1A1A] dark:text-[#F0F0F0]">
              {entry.meal.name}
            </h2>

            {/* Metadata row — icons + small caps, gray, no color */}
            <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
              <span>👥 {currentServings} servings</span>
              {entry.meal.tags?.[0] && <span>🏷 {entry.meal.tags[0]}</span>}
              {inventoryMatchCount > 0 && (
                <span style={{ color: ACCENT }}>
                  ✓ Uses {inventoryMatchCount}/{entry.meal.ingredients.length} things you have
                </span>
              )}
            </div>

            {entry.meal.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.meal.image_url}
                alt={entry.meal.name}
                className="mb-6 h-72 w-full rounded-xl object-cover"
              />
            )}

            {/* Action row — text + icon, not filled pill buttons */}
            <div className="mb-8 flex items-center gap-6 border-b border-t border-[#1A1A1A]/8 dark:border-[#F0F0F0]/8 py-3">
              <button
                onClick={() => setCookingMode(true)}
                className="flex items-center gap-1.5 text-sm font-bold"
                style={{ color: ACCENT }}
              >
                ▶ Cook
              </button>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-[#1A1A1A]/50 dark:text-[#F0F0F0]/50">
                <button onClick={() => adjustServings(-1)} className="px-1 hover:text-[#1A1A1A] dark:hover:text-[#F0F0F0]">
                  −
                </button>
                <span className="text-[#1A1A1A] dark:text-[#F0F0F0]">{currentServings} servings</span>
                <button onClick={() => adjustServings(1)} className="px-1 hover:text-[#1A1A1A] dark:hover:text-[#F0F0F0]">
                  +
                </button>
              </div>
            </div>

            <div className="grid gap-10 sm:grid-cols-[1fr_1.4fr]">
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
                  Ingredients
                </h3>
                <ul className="space-y-2 text-sm text-[#1A1A1A]/85 dark:text-[#F0F0F0]/85">
                  {scaledIngredients.map((ing, i) => {
                    const haveIt = inventoryNames.has(ing.name.toLowerCase().trim());
                    return (
                      <li key={i}>
                        <span className="font-bold text-[#1A1A1A] dark:text-[#F0F0F0]">
                          {Math.round(ing.quantity * 100) / 100} {ing.unit}
                        </span>{" "}
                        {ing.name}
                        {haveIt && (
                          <span className="ml-1.5 text-xs" style={{ color: ACCENT }}>
                            ✓
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
                  Instructions
                </h3>
                <ol className="space-y-3 text-sm leading-relaxed text-[#1A1A1A]/85 dark:text-[#F0F0F0]/85">
                  {steps.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="font-bold text-[#1A1A1A]/30 dark:text-[#F0F0F0]/30">{i + 1}</span>
                      <span>
                        <span className="font-bold text-[#1A1A1A] dark:text-[#F0F0F0]">{step.title}.</span>{" "}
                        {renderStepContent(step.content, entry.meal.ingredients, baseServings, currentServings)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="mt-8 border-t border-[#1A1A1A]/8 dark:border-[#F0F0F0]/8 pt-6">
              {entry.meal.id && ratedMeals[entry.meal.id] ? (
                <p className="text-sm font-semibold text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
                  {ratedMeals[entry.meal.id] === "skipped"
                    ? "Marked as skipped — won't suggest this again soon."
                    : "Thanks — noted for next time."}
                </p>
              ) : entry.meal.id && cookedMealIds.has(entry.meal.id) ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40 dark:text-[#F0F0F0]/40">
                    How was it?
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm font-semibold text-[#1A1A1A]/50 dark:text-[#F0F0F0]/50">
                    <button onClick={() => handleRate(entry.meal.id, 5)} className="hover:text-[#1A1A1A] dark:hover:text-[#F0F0F0]">
                      👍 Loved it
                    </button>
                    <button onClick={() => handleRate(entry.meal.id, 1)} className="hover:text-[#1A1A1A] dark:hover:text-[#F0F0F0]">
                      👎 Not for me
                    </button>
                    <button onClick={() => handleRate(entry.meal.id, null)} className="text-[#1A1A1A]/30 dark:text-[#F0F0F0]/30 hover:text-[#1A1A1A]/60 dark:hover:text-[#F0F0F0]/60">
                      Skip rating
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => handleMarkStatus(entry.meal.id, "cooked")}
                    disabled={markingStatus}
                    className="rounded-full px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: ACCENT }}
                  >
                    {markingStatus ? "Saving…" : "✅ Finished cooking"}
                  </button>
                  <button
                    onClick={() => handleMarkStatus(entry.meal.id, "skipped")}
                    disabled={markingStatus}
                    className="rounded-full border border-[#1A1A1A]/15 dark:border-[#F0F0F0]/15 px-6 py-3 text-sm font-bold text-[#1A1A1A] dark:text-[#F0F0F0] transition-colors hover:border-[#1A1A1A]/30 dark:hover:border-[#F0F0F0]/30 disabled:opacity-50"
                  >
                    ⏭️ Skipped it
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {cookingMode && entry && (
        <CookingMode
          steps={normalizeSteps(entry.meal.instructions).map((s) => ({
            ...s,
            content: renderStepContent(s.content, entry.meal.ingredients, baseServings, currentServings),
          }))}
          mealName={`${entry.meal.name} (${currentServings} servings)`}
          onClose={() => setCookingMode(false)}
        />
      )}
    </main>
  );
}
