// app/preferences/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Preferences {
  dislikes: string[];
  time_budget_minutes: number;
  skill_level: string;
  cuisine_leanings: string[];
  pantry_staples: string[];
}

function TagInput({
  label,
  hint,
  values,
  onChange,
  color,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (v: string[]) => void;
  color: string;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div className="mb-6">
      <label className="mb-1 block text-sm font-bold text-[#1C1C1E]">{label}</label>
      <p className="mb-3 text-xs text-[#1C1C1E]/40">{hint}</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {values.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="ml-0.5 text-white/70 hover:text-white"
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Type and press Enter…"
          className="flex-1 rounded-full bg-[#F7F6F2] px-4 py-2 text-sm text-[#1C1C1E] outline-none transition-all focus:ring-2 focus:ring-[#1C1C1E]/10"
        />
        <button
          onClick={addTag}
          className="rounded-full bg-[#1C1C1E]/5 px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 hover:bg-[#1C1C1E]/10"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function PreferencesPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setPrefs(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Couldn't load your preferences.");
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Couldn't save. Try again.");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message ?? "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#F7F6F2] px-5 py-10 md:px-10">
        <div className="mx-auto max-w-2xl text-sm text-[#1C1C1E]/40">Loading…</div>
      </main>
    );
  }

  if (!prefs) return null;

  return (
    <main className="min-h-screen bg-[#F7F6F2] px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-[#1C1C1E]">
              Preferences ⚙️
            </h1>
            <p className="mt-1 text-sm text-[#1C1C1E]/50">
              What the assistant should know before it plans anything.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#1C1C1E]/70 shadow-sm hover:shadow-md"
          >
            ← Back
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-[#FF6B5A]/10 px-5 py-3.5 text-sm font-medium text-[#D14A3A]">
            {error}
          </div>
        )}

        <div className="rounded-3xl bg-white p-6 shadow-sm md:p-8">
          <TagInput
            label="Dislikes"
            hint="Ingredients that should never show up, in any form."
            values={prefs.dislikes}
            onChange={(v) => setPrefs({ ...prefs, dislikes: v })}
            color="#FF6B5A"
          />

          <TagInput
            label="Cuisine leanings"
            hint="Styles to favor — not exclusive, just weighted toward."
            values={prefs.cuisine_leanings}
            onChange={(v) => setPrefs({ ...prefs, cuisine_leanings: v })}
            color="#4A9DE0"
          />

          <TagInput
            label="Pantry staples"
            hint="Always assumed on hand — left off grocery lists."
            values={prefs.pantry_staples}
            onChange={(v) => setPrefs({ ...prefs, pantry_staples: v })}
            color="#5FA88A"
          />

          <div className="mb-6">
            <label className="mb-1 block text-sm font-bold text-[#1C1C1E]">
              Time budget
            </label>
            <p className="mb-3 text-xs text-[#1C1C1E]/40">
              Max minutes a meal should take to cook.
            </p>
            <input
              type="number"
              min={10}
              max={180}
              value={prefs.time_budget_minutes}
              onChange={(e) =>
                setPrefs({ ...prefs, time_budget_minutes: Number(e.target.value) })
              }
              className="w-32 rounded-full bg-[#F7F6F2] px-4 py-2 text-sm text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[#1C1C1E]/10"
            />
            <span className="ml-2 text-sm text-[#1C1C1E]/40">minutes</span>
          </div>

          <div className="mb-2">
            <label className="mb-1 block text-sm font-bold text-[#1C1C1E]">
              Skill level
            </label>
            <p className="mb-3 text-xs text-[#1C1C1E]/40">
              How complex instructions should be.
            </p>
            <div className="flex gap-2">
              {["beginner", "intermediate", "advanced"].map((level) => (
                <button
                  key={level}
                  onClick={() => setPrefs({ ...prefs, skill_level: level })}
                  className="rounded-full px-4 py-2 text-sm font-semibold capitalize transition-all"
                  style={
                    prefs.skill_level === level
                      ? { backgroundColor: "#9B6BE5", color: "white" }
                      : { backgroundColor: "#F7F6F2", color: "#1C1C1E80" }
                  }
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 rounded-full bg-[#1C1C1E] px-8 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
        </button>
      </div>
    </main>
  );
}
