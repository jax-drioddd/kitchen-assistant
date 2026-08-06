// app/preferences/page.tsx
"use client";

import { useEffect, useState } from "react";

interface Preferences {
  dislikes: string[];
  time_budget_minutes: number;
  skill_level: string;
  cuisine_leanings: string[];
  pantry_staples: string[];
  default_servings: number;
}

const ACCENT = "#E8674A";

function TagInput({
  label,
  hint,
  values,
  onChange,
}: {
  label: string;
  hint: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addTag() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(values.filter((v) => v !== tag));
  }

  return (
    <div className="mb-6">
      <label className="mb-1 block text-sm font-bold text-[#1A1A1A]">{label}</label>
      <p className="mb-3 text-xs text-[#1A1A1A]/40">{hint}</p>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full border border-[#1A1A1A]/15 px-3 py-1 text-sm text-[#1A1A1A]"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="text-[#1A1A1A]/40 hover:text-[#1A1A1A]" aria-label={`Remove ${tag}`}>
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
          className="flex-1 rounded-full border border-[#1A1A1A]/12 px-4 py-2 text-sm text-[#1A1A1A] outline-none focus:border-[#1A1A1A]/30"
        />
        <button onClick={addTag} className="text-sm font-semibold text-[#1A1A1A]/50 hover:text-[#1A1A1A]">
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
      <main className="min-h-screen bg-white px-5 py-10 md:px-10">
        <div className="mx-auto max-w-2xl text-sm text-[#1A1A1A]/40">Loading…</div>
      </main>
    );
  }

  if (!prefs) return null;

  return (
    <main className="min-h-screen bg-white px-5 py-8 md:px-10 md:py-12">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">Preferences</h1>
          <p className="mt-0.5 text-sm text-[#1A1A1A]/45">
            What the assistant should know before it plans anything.
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        <div className="border-b border-[#1A1A1A]/8 pb-6">
          <TagInput
            label="Dislikes"
            hint="Ingredients that should never show up, in any form."
            values={prefs.dislikes}
            onChange={(v) => setPrefs({ ...prefs, dislikes: v })}
          />
          <TagInput
            label="Cuisine leanings"
            hint="Styles to favor — not exclusive, just weighted toward."
            values={prefs.cuisine_leanings}
            onChange={(v) => setPrefs({ ...prefs, cuisine_leanings: v })}
          />
          <TagInput
            label="Pantry staples"
            hint="Always assumed on hand — left off grocery lists."
            values={prefs.pantry_staples}
            onChange={(v) => setPrefs({ ...prefs, pantry_staples: v })}
          />

          <div className="mb-6">
            <label className="mb-1 block text-sm font-bold text-[#1A1A1A]">Usual servings</label>
            <p className="mb-3 text-xs text-[#1A1A1A]/40">
              How many people you're usually cooking for. You can still adjust per-recipe before cooking.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPrefs({ ...prefs, default_servings: Math.max(1, (prefs.default_servings ?? 2) - 1) })}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A1A1A]/15 text-base font-bold text-[#1A1A1A]/60 hover:border-[#1A1A1A]/30"
              >
                −
              </button>
              <span className="w-6 text-center text-base font-bold text-[#1A1A1A]">{prefs.default_servings ?? 2}</span>
              <button
                onClick={() => setPrefs({ ...prefs, default_servings: (prefs.default_servings ?? 2) + 1 })}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1A1A1A]/15 text-base font-bold text-[#1A1A1A]/60 hover:border-[#1A1A1A]/30"
              >
                +
              </button>
            </div>
          </div>

          <div className="mb-6">
            <label className="mb-1 block text-sm font-bold text-[#1A1A1A]">Time budget</label>
            <p className="mb-3 text-xs text-[#1A1A1A]/40">Max minutes a meal should take to cook.</p>
            <input
              type="number"
              min={10}
              max={180}
              value={prefs.time_budget_minutes}
              onChange={(e) => setPrefs({ ...prefs, time_budget_minutes: Number(e.target.value) })}
              className="w-24 rounded-full border border-[#1A1A1A]/12 px-4 py-1.5 text-sm text-[#1A1A1A] outline-none focus:border-[#1A1A1A]/30"
            />
            <span className="ml-2 text-sm text-[#1A1A1A]/40">minutes</span>
          </div>

          <div className="mb-2">
            <label className="mb-1 block text-sm font-bold text-[#1A1A1A]">Skill level</label>
            <p className="mb-3 text-xs text-[#1A1A1A]/40">How complex instructions should be.</p>
            <div className="flex gap-1.5">
              {["beginner", "intermediate", "advanced"].map((level) => (
                <button
                  key={level}
                  onClick={() => setPrefs({ ...prefs, skill_level: level })}
                  className="rounded-full px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors"
                  style={
                    prefs.skill_level === level
                      ? { backgroundColor: ACCENT, color: "white" }
                      : { color: "#1A1A1A70" }
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
          className="mt-6 rounded-full px-8 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
        </button>
      </div>
    </main>
  );
}
