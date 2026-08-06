// app/components/Dashboard.tsx
"use client";

import { useEffect, useState } from "react";
import { normalizeSteps, renderStepContent } from "../lib/steps";

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

const ALL_DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

const ACCENT = "#E8674A";

export default function Dashboard({ initialWeek }: { initialWeek: DayEntry[] | null }) {
  const [week, setWeek] = useState<DayEntry[] | null>(initialWeek);
  const [selectedDays, setSelectedDays] = useState<string[]>(ALL_DAYS);
  const [weekInstructions, setWeekInstructions] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(!initialWeek);
  const [generating, setGenerating] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryUrl, setGroceryUrl] = useState<string | null>(null);
  const [groceryItems, setGroceryItems] = useState<Ingredient[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: selectedDays, instructions: weekInstructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate the week. Try again.");

      const entries: DayEntry[] = data.meals.map((m: Meal) => ({ day: m.day, meal: m }));
      setWeek(entries);
      setShowOnboarding(false);
      setGroceryUrl(null);
    } catch (err: any) {
      setError(err.message ?? "Couldn't generate the week. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleGetGroceryList() {
    setError(null);
    setGroceryLoading(true);
    try {
      const res = await fetch("/api/grocery-list", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't build the grocery list. Try again.");
      setGroceryUrl(data.sheet_url);
      setGroceryItems(data.items ?? null);
    } catch (err: any) {
      setError(err.message ?? "Couldn't build the grocery list. Try again.");
    } finally {
      setGroceryLoading(false);
    }
  }

  function groceryListAsText(): string {
    if (!groceryItems) return "";
    return groceryItems
      .map((ing) => `${ing.quantity} ${ing.unit} ${ing.name}`.replace(/\s+/g, " ").trim())
      .join("\n");
  }

  async function handleExport() {
    const text = groceryListAsText();
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "Grocery list", text });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't export the list. Try again.");
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim()) return;
    const userMessage = chatInput.trim();
    setChatMessages((prev) => [...prev, { role: "user", text: userMessage }]);
    setChatInput("");
    setChatLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That swap didn't go through. Try again.");

      setChatMessages((prev) => [...prev, { role: "assistant", text: data.reply ?? "Updated." }]);

      if (data.updated_day && data.meal) {
        setWeek((prev) =>
          prev
            ? prev.map((d) => (d.day === data.updated_day ? { day: d.day, meal: data.meal } : d))
            : prev
        );
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: err.message ?? "That swap didn't go through. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">
            Create week plan
          </h1>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/45">
            {week ? `${week.length} meal${week.length === 1 ? "" : "s"} planned` : "Generate meals, adjust with chat, and build your grocery list."}
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {showOnboarding && (
          <div className="mb-8 border-b border-[#1A1A1A]/8 pb-8">
            <h2 className="mb-3 text-sm font-bold text-[#1A1A1A]">Which days do you want planned?</h2>
            <div className="mb-5 flex flex-wrap gap-1">
              {ALL_DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className="rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors"
                  style={
                    selectedDays.includes(day)
                      ? { backgroundColor: ACCENT, color: "white" }
                      : { color: "#1A1A1A70" }
                  }
                >
                  {day}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-sm font-bold text-[#1A1A1A]">
              Anything specific for this week? <span className="font-normal text-[#1A1A1A]/40">(optional)</span>
            </label>
            <p className="mb-2 text-xs text-[#1A1A1A]/40">
              e.g. "chicken Monday, something Indian Wednesday, keep it light this week"
            </p>
            <textarea
              value={weekInstructions}
              onChange={(e) => setWeekInstructions(e.target.value)}
              placeholder="Type any day-specific requests or general themes…"
              rows={2}
              className="mb-5 w-full resize-none rounded-2xl border border-[#1A1A1A]/12 px-4 py-2.5 text-sm text-[#1A1A1A] outline-none focus:border-[#1A1A1A]/30"
            />

            <button
              onClick={handleGenerate}
              disabled={generating || selectedDays.length === 0}
              className="rounded-full px-6 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: ACCENT }}
            >
              {generating
                ? "Generating… (~30-40s)"
                : `Generate ${selectedDays.length} day${selectedDays.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {!showOnboarding && week && (
          <div className="mb-6">
            <button
              onClick={() => setShowOnboarding(true)}
              className="text-sm font-semibold text-[#1A1A1A]/50 hover:text-[#1A1A1A]"
            >
              ↺ Regenerate week
            </button>
          </div>
        )}

        {week && (
          <div className="mb-8 divide-y divide-[#1A1A1A]/8">
            {week.map(({ day, meal }) => {
              const matchCount = meal.ingredients.filter((ing) =>
                inventoryNames.has(ing.name.toLowerCase().trim())
              ).length;

              return (
                <details key={day} className="group py-4 first:pt-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      {meal.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={meal.image_url} alt={day} className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white"
                          style={{ backgroundColor: ACCENT }}
                        >
                          {day.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40">{day}</span>
                        <h2 className="text-lg font-bold leading-tight text-[#1A1A1A]">{meal.name}</h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-wide text-[#1A1A1A]/40">
                          {meal.tags?.[0] && <span>🏷 {meal.tags[0]}</span>}
                          {matchCount > 0 && (
                            <span style={{ color: ACCENT }}>
                              ✓ Uses {matchCount} thing{matchCount === 1 ? "" : "s"} you have
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-[#1A1A1A]/25 transition-transform group-open:rotate-180">▾</span>
                  </summary>

                  <div className="pt-4">
                    {meal.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meal.image_url} alt={meal.name} className="mb-4 h-64 w-full rounded-xl object-cover" />
                    )}
                    <div className="grid gap-6 sm:grid-cols-2">
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40">
                          Ingredients
                        </h3>
                        <ul className="space-y-1.5 text-sm text-[#1A1A1A]/80">
                          {meal.ingredients.map((ing, idx) => {
                            const haveIt = inventoryNames.has(ing.name.toLowerCase().trim());
                            return (
                              <li key={idx}>
                                <span className="font-bold text-[#1A1A1A]">{ing.quantity} {ing.unit}</span> {ing.name}
                                {haveIt && (
                                  <span className="ml-1.5 text-xs font-bold" style={{ color: ACCENT }}>✓</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                      <div>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#1A1A1A]/40">
                          Instructions
                        </h3>
                        <ol className="space-y-2 text-sm leading-relaxed text-[#1A1A1A]/80">
                          {normalizeSteps(meal.instructions).map((step, idx) => (
                            <li key={idx} className="flex gap-2.5">
                              <span className="font-bold text-[#1A1A1A]/30">{idx + 1}</span>
                              <span>
                                <span className="font-bold text-[#1A1A1A]">{step.title}.</span>{" "}
                                {renderStepContent(step.content, meal.ingredients, meal.base_servings ?? 2, meal.base_servings ?? 2)}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}

        {week && (
          <div className="mb-8 border-t border-[#1A1A1A]/8 pt-6">
            <h2 className="mb-1 text-sm font-bold text-[#1A1A1A]">Adjust your week</h2>
            <p className="mb-3 text-xs text-[#1A1A1A]/40">e.g. "swap wednesday, don't feel like chicken"</p>
            <div className="mb-3 max-h-56 space-y-2 overflow-y-auto">
              {chatMessages.length === 0 && (
                <p className="text-sm text-[#1A1A1A]/30">No messages yet — try one above.</p>
              )}
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === "user" ? "ml-auto bg-[#1A1A1A] text-white" : "bg-[#1A1A1A]/5 text-[#1A1A1A]/85"
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {chatLoading && <div className="w-fit rounded-2xl bg-[#1A1A1A]/5 px-4 py-2 text-sm text-[#1A1A1A]/40">Thinking…</div>}
            </div>
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                placeholder="Type a swap request…"
                className="flex-1 rounded-full border border-[#1A1A1A]/12 px-4 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#1A1A1A]/30"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading}
                className="rounded-full px-5 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: ACCENT }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {week && !groceryItems && (
          <div className="border-t border-[#1A1A1A]/8 pt-6 text-center">
            <button
              onClick={handleGetGroceryList}
              disabled={groceryLoading}
              className="rounded-full px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}
            >
              {groceryLoading ? "Building list…" : "Get grocery list"}
            </button>
          </div>
        )}

        {groceryItems && (
          <div className="border-t border-[#1A1A1A]/8 pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#1A1A1A]">This week's list</h2>
              <span className="text-xs font-semibold text-[#1A1A1A]/40">
                {groceryItems.length} item{groceryItems.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mb-5 columns-1 gap-x-8 text-sm text-[#1A1A1A]/80 sm:columns-2">
              {groceryItems.map((ing, i) => (
                <li key={i} className="mb-1.5 break-inside-avoid">
                  <span className="font-bold text-[#1A1A1A]">{ing.quantity} {ing.unit}</span> {ing.name}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-5 text-sm font-semibold">
              {groceryUrl && (
                <a href={groceryUrl} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT }}>
                  Order on Instacart →
                </a>
              )}
              <button onClick={() => window.print()} className="text-[#1A1A1A]/50 hover:text-[#1A1A1A]">
                Print list
              </button>
              <button onClick={handleExport} className="text-[#1A1A1A]/50 hover:text-[#1A1A1A]">
                {copied ? "Copied ✓" : "Export"}
              </button>
              <button onClick={handleGetGroceryList} disabled={groceryLoading} className="text-[#1A1A1A]/50 hover:text-[#1A1A1A] disabled:opacity-50">
                {groceryLoading ? "Refreshing…" : "Refresh list"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
