// app/components/Dashboard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { normalizeSteps } from "../lib/steps";

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

const ALL_DAYS = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

// Curated accent palette — one color per day, cycling. Each is saturated
// enough to carry real personality but calibrated to sit well against the
// warm neutral canvas rather than fighting it.
const ACCENTS = [
  { name: "coral", bg: "#FF6B5A", soft: "#FFEEEC" },
  { name: "sunflower", bg: "#F5A623", soft: "#FFF6E5" },
  { name: "sky", bg: "#4A9DE0", soft: "#EAF4FC" },
  { name: "sage", bg: "#5FA88A", soft: "#EAF5F0" },
  { name: "plum", bg: "#9B6BE5", soft: "#F3EDFC" },
  { name: "rose", bg: "#F2739E", soft: "#FDECF2" },
  { name: "teal", bg: "#3EB0A8", soft: "#E8F7F5" },
];

function DayIcon({
  day,
  color,
  imageUrl,
}: {
  day: string;
  color: string;
  imageUrl?: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={day}
        className="h-11 w-11 shrink-0 rounded-2xl object-cover shadow-sm"
      />
    );
  }
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: color }}
    >
      {day.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function Dashboard({ initialWeek }: { initialWeek: DayEntry[] | null }) {
  const [week, setWeek] = useState<DayEntry[] | null>(initialWeek);
  const [selectedDays, setSelectedDays] = useState<string[]>(ALL_DAYS);
  const [showOnboarding, setShowOnboarding] = useState(!initialWeek);
  const [generating, setGenerating] = useState(false);
  const [groceryLoading, setGroceryLoading] = useState(false);
  const [groceryUrl, setGroceryUrl] = useState<string | null>(null);
  const [groceryItems, setGroceryItems] = useState<Ingredient[] | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ days: selectedDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't generate the week. Try again.");

      const entries: DayEntry[] = data.meals.map((m: Meal) => ({
        day: m.day,
        meal: m,
      }));
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

      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", text: data.reply ?? "Updated." },
      ]);

      if (data.updated_day && data.meal) {
        setWeek((prev) =>
          prev
            ? prev.map((d) =>
                d.day === data.updated_day ? { day: d.day, meal: data.meal } : d
              )
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
    <main className="min-h-screen bg-[#F7F6F2] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="mb-2 inline-block text-sm font-semibold text-[#1C1C1E]/40 hover:text-[#1C1C1E]/70"
            >
              ← Back to this week
            </Link>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E] md:text-4xl">
              Create week plan 📝
            </h1>
            <p className="mt-1 text-sm text-[#1C1C1E]/50">
              Generate meals, adjust with chat, and build your grocery list.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 shadow-sm">
              {week ? `${week.length} meal${week.length === 1 ? "" : "s"}` : "No plan yet"}
            </div>
            <Link
              href="/preferences"
              className="rounded-full bg-white px-4 py-2 text-sm shadow-sm transition-all hover:shadow-md"
              aria-label="Preferences"
            >
              ⚙️
            </Link>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-2xl bg-[#FF6B5A]/10 px-5 py-3.5 text-sm font-medium text-[#D14A3A]">
            {error}
          </div>
        )}

        {/* Onboarding / regenerate form */}
        {showOnboarding && (
          <div className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-[#1C1C1E]">
              Which days do you want planned?
            </h2>
            <div className="mb-5 flex flex-wrap gap-2">
              {ALL_DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className="rounded-full px-4 py-2 text-sm font-semibold transition-all"
                  style={
                    selectedDays.includes(day)
                      ? { backgroundColor: ACCENTS[i % ACCENTS.length].bg, color: "white" }
                      : { backgroundColor: "#EDECE7", color: "#1C1C1E80" }
                  }
                >
                  {day}
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || selectedDays.length === 0}
              className="rounded-full bg-[#1C1C1E] px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-40 disabled:hover:scale-100"
            >
              {generating
                ? "Generating… (~30-40s)"
                : `Generate ${selectedDays.length} day${selectedDays.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}

        {!showOnboarding && week && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowOnboarding(true)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#1C1C1E]/70 shadow-sm transition-all hover:shadow-md"
            >
              Regenerate week
            </button>
          </div>
        )}

        {/* Weekly plan */}
        {week && (
          <div className="mb-8 space-y-3">
            {week.map(({ day, meal }, i) => {
              const accent = ACCENTS[i % ACCENTS.length];
              return (
                <details
                  key={day}
                  className="group overflow-hidden rounded-3xl bg-white shadow-sm transition-all open:shadow-lg"
                  style={{ borderLeft: `5px solid ${accent.bg}` }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <div className="flex items-center gap-3.5">
                      <DayIcon day={day} color={accent.bg} imageUrl={meal.image_url} />
                      <div>
                        <span className="text-xs font-bold uppercase tracking-wide text-[#1C1C1E]/40">
                          {day}
                        </span>
                        <h2 className="text-base font-bold text-[#1C1C1E]">
                          {meal.name}
                        </h2>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="hidden gap-1.5 sm:flex">
                        {meal.tags?.slice(0, 2).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                            style={{ backgroundColor: accent.soft, color: accent.bg }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-[#1C1C1E]/25 transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </div>
                  </summary>

                  <div className="px-5 pb-5">
                    {meal.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={meal.image_url}
                        alt={meal.name}
                        className="mb-4 h-72 w-full rounded-2xl object-cover shadow-sm"
                      />
                    )}
                    <div
                      className="grid gap-5 rounded-2xl p-5 sm:grid-cols-2"
                      style={{ backgroundColor: accent.soft }}
                    >
                      <div>
                        <h3
                          className="mb-2.5 text-xs font-bold uppercase tracking-wide"
                          style={{ color: accent.bg }}
                        >
                          Ingredients
                        </h3>
                        <ul className="space-y-1.5 text-sm text-[#1C1C1E]/80">
                          {meal.ingredients.map((ing, idx) => (
                            <li key={idx}>
                              {ing.quantity} {ing.unit} {ing.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h3
                          className="mb-2.5 text-xs font-bold uppercase tracking-wide"
                          style={{ color: accent.bg }}
                        >
                          Instructions
                        </h3>
                        <ol className="space-y-2.5 text-sm text-[#1C1C1E]/80">
                          {normalizeSteps(meal.instructions).map((step, idx) => (
                            <li key={idx} className="flex gap-2.5">
                              <span className="font-bold" style={{ color: accent.bg }}>
                                {idx + 1}
                              </span>
                              <span>
                                <span className="font-semibold text-[#1C1C1E]">{step.title}.</span>{" "}
                                {step.content}
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

        {/* Chat panel */}
        {week && (
          <div className="rounded-3xl bg-white shadow-sm">
            <div className="px-5 pt-5">
              <h2 className="text-lg font-bold text-[#1C1C1E]">
                Adjust your week 💬
              </h2>
              <p className="mb-3 text-sm text-[#1C1C1E]/40">
                e.g. "swap wednesday, don't feel like chicken"
              </p>
            </div>
            <div className="max-h-64 space-y-3 overflow-y-auto px-5 py-2">
              {chatMessages.length === 0 && (
                <p className="text-sm text-[#1C1C1E]/30">No messages yet — try one above.</p>
              )}
              {chatMessages.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    m.role === "user"
                      ? "ml-auto bg-[#1C1C1E] text-white"
                      : "bg-[#F7F6F2] text-[#1C1C1E]/85"
                  }`}
                >
                  {m.text}
                </div>
              ))}
              {chatLoading && (
                <div className="w-fit rounded-2xl bg-[#F7F6F2] px-4 py-2.5 text-sm text-[#1C1C1E]/40">
                  Thinking…
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleChatSend()}
                placeholder="Type a swap request…"
                className="flex-1 rounded-full bg-[#F7F6F2] px-4 py-2.5 text-sm text-[#1C1C1E] outline-none transition-all focus:ring-2 focus:ring-[#1C1C1E]/10"
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading}
                className="rounded-full bg-[#1C1C1E] px-5 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* Grocery list — the final action, once the week's actually settled */}
        {week && !groceryItems && (
          <div className="mt-8 text-center">
            <button
              onClick={handleGetGroceryList}
              disabled={groceryLoading}
              className="rounded-full bg-[#1C1C1E] px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
            >
              {groceryLoading ? "Building list…" : "Get grocery list 🛒"}
            </button>
          </div>
        )}

        {groceryItems && (
          <div className="mt-8 rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1C1C1E]">
                This week's list 📝
              </h2>
              <span className="text-sm font-semibold text-[#1C1C1E]/40">
                {groceryItems.length} item{groceryItems.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="mb-5 columns-1 gap-x-8 text-sm text-[#1C1C1E]/80 sm:columns-2">
              {groceryItems.map((ing, i) => (
                <li key={i} className="mb-1.5 break-inside-avoid">
                  {ing.quantity} {ing.unit} {ing.name}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              {groceryUrl && (
                <a
                  href={groceryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow-md"
                  style={{ backgroundColor: "#5FA88A" }}
                >
                  Order on Instacart →
                </a>
              )}
              <button
                onClick={() => window.print()}
                className="rounded-full bg-[#F7F6F2] px-5 py-2.5 text-sm font-semibold text-[#1C1C1E]/70 transition-all hover:bg-[#EDECE7]"
              >
                Print list
              </button>
              <button
                onClick={handleGetGroceryList}
                disabled={groceryLoading}
                className="rounded-full bg-[#F7F6F2] px-5 py-2.5 text-sm font-semibold text-[#1C1C1E]/70 transition-all hover:bg-[#EDECE7] disabled:opacity-50"
              >
                {groceryLoading ? "Refreshing…" : "Refresh list"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
