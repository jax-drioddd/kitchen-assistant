// app/api/generate-week/route.ts
//
// Generates a full week of meals tailored to stored preferences and recent
// history, so it doesn't quietly repeat what you cooked last week. Returns
// structured JSON the dashboard can render directly and the grocery-list
// endpoint can dedupe against.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Preferences {
  dislikes: string[];
  time_budget_minutes: number;
  skill_level: "beginner" | "intermediate" | "advanced";
  cuisine_leanings: string[];
  pantry_staples: string[];
}

interface Ingredient {
  name: string;
  quantity: number;
  unit: string; // "" for countable items like "2 chicken breasts"
}

interface RecipeStep {
  title: string; // short summary, e.g. "Sear the chicken"
  content: string; // full instruction text
  timer_seconds: number | null; // null for active steps with no waiting
}

interface Meal {
  day: string; // "Monday" ... "Sunday"
  name: string;
  ingredients: Ingredient[];
  instructions: RecipeStep[];
  tags: string[];
  id?: string;
  image_url?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    // Accept an optional list of days to plan from the onboarding form.
    // Defaults to the full week if none provided (e.g. direct curl testing).
    let requestedDays: string[] = [
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
    ];
    try {
      const body = await req.json();
      if (Array.isArray(body?.days) && body.days.length > 0) {
        requestedDays = body.days;
      }
    } catch {
      // No body sent (e.g. plain curl -X POST) — fall back to full week, fine.
    }

    // 1. Load preferences (single-row table, no multi-user auth yet)
    const { data: prefs, error: prefsError } = await supabase
      .from("preferences")
      .select("*")
      .single();

    if (prefsError || !prefs) {
      return NextResponse.json(
        { error: "No preferences found. Complete onboarding first." },
        { status: 400 }
      );
    }

    // 2. Pull the last 2 weeks of meal history so the model has real
    //    material to avoid repeating, not just a vague instruction.
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: recentHistory } = await supabase
      .from("meal_history")
      .select("meal_id, meals(name, tags), rating, status")
      .gte("date", twoWeeksAgo.toISOString());

    const recentMealNames =
      recentHistory?.map((h: any) => h.meals?.name).filter(Boolean) ?? [];

    const lowRatedMeals =
      recentHistory
        ?.filter((h: any) => h.rating != null && h.rating <= 2)
        .map((h: any) => h.meals?.name)
        .filter(Boolean) ?? [];

    // 3. Build the prompt. Structured-JSON-only instruction up front,
    //    preferences and history folded in as concrete constraints rather
    //    than vague guidance, since specific constraints produce better
    //    generations than "please be varied."
    const prompt = buildWeekPrompt(prefs as Preferences, recentMealNames, lowRatedMeals, requestedDays);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    console.log("Full Claude API response:", JSON.stringify(data, null, 2));

    const textBlock = data.content?.find((block: any) => block.type === "text");
    const rawText = textBlock?.text ?? "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let week: Meal[];
    try {
      week = JSON.parse(cleaned);
    } catch {
      throw new Error("Model did not return valid JSON. Raw response: " + rawText.slice(0, 500));
    }

    // 4. Persist: one row per meal, one weekly_plans row mapping days to meals.
    //    Look up a stock photo per dish from Pexels before inserting — if the
    //    lookup fails or finds nothing, fall back to no image rather than
    //    failing the whole generation over a missing photo.
    const weekStart = getMonday(new Date()).toISOString().slice(0, 10);
    const dayToMealId: Record<string, string> = {};

    for (const meal of week) {
      const imageUrl = await findMealPhoto(meal.name);

      const { data: inserted, error: insertError } = await supabase
        .from("meals")
        .insert({
          name: meal.name,
          ingredients: meal.ingredients,
          instructions: meal.instructions,
          tags: meal.tags,
          image_url: imageUrl,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        throw new Error(`Failed to save meal "${meal.name}": ${insertError?.message}`);
      }
      dayToMealId[meal.day] = inserted.id;
      (meal as any).id = inserted.id;
      (meal as any).image_url = imageUrl;
    }

    const { error: planError } = await supabase.from("weekly_plans").upsert({
      week_start: weekStart,
      days: dayToMealId,
    });

    if (planError) throw new Error(`Failed to save weekly plan: ${planError.message}`);

    return NextResponse.json({ week_start: weekStart, meals: week });
  } catch (err: any) {
    console.error("generate-week error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

function buildWeekPrompt(
  prefs: Preferences,
  recentMealNames: string[],
  lowRatedMeals: string[],
  days: string[]
): string {
  return `You are planning dinners for one person for these specific days: ${days.join(", ")}.

Respond with ONLY valid JSON — no markdown fences, no preamble, no explanation.
The response must be a JSON array of exactly ${days.length} objects, one per day listed
above (use those exact day names), in this shape:

[
  {
    "day": "Monday",
    "name": "string",
    "ingredients": [{ "name": "string", "quantity": number, "unit": "string" }],
    "instructions": [
      {
        "title": "short summary, e.g. 'Sear the chicken'",
        "content": "the full instruction text for this step",
        "timer_seconds": 300
      }
    ],
    "tags": ["string"]
  }
]

Hard constraints:
- Never use these disliked ingredients in any form: ${prefs.dislikes.join(", ") || "none"}
- Each meal must be cookable within ${prefs.time_budget_minutes} minutes
- Skill level: ${prefs.skill_level} — instructions should match this level of complexity
- Cuisine leanings to favor (not exclusive, just weighted toward): ${prefs.cuisine_leanings.join(", ") || "no strong preference"}
- Assume these pantry staples are always on hand and do NOT include them in ingredients: ${prefs.pantry_staples.join(", ") || "none specified"}

Variety constraints (real, not decorative):
- Do not repeat any of these meals from the last 2 weeks: ${recentMealNames.join(", ") || "none logged yet"}
- Avoid the flavor/protein profile of these low-rated meals, they didn't land: ${lowRatedMeals.join(", ") || "none"}
- Vary protein sources across the week — do not use the same primary protein more than twice
- Vary cuisine style across the week, not the same cuisine 3+ days running

Ingredient formatting rules (this matters for downstream deduping, be precise):
- Use consistent, singular ingredient names ("chicken breast" not "chicken breasts")
- For countable items, quantity is the count and unit is "" (e.g. {"name": "egg", "quantity": 4, "unit": ""})
- For measured items, use standard units: lb, oz, cup, tbsp, tsp, g, ml
- Do not use vague quantities like "a handful" or "to taste" — give a real number

Step formatting rules (this powers a step-by-step cooking mode with timers, be precise):
- Break instructions into discrete steps — one clear action per step, not paragraphs
- title: a short 2-5 word summary of the step, used as a header
- content: the full instruction text for that step — include the SPECIFIC
  AMOUNT of every ingredient used in that step (e.g. "Whisk together 2 tbsp
  fish sauce, 1 tbsp tamarind paste, and 1 tsp brown sugar," not "whisk
  together the fish sauce, tamarind, and sugar"). Someone using cooking mode
  should never need to look back at a separate ingredients list — each step
  must be fully self-contained with real quantities.
- timer_seconds: include whenever the step involves waiting, cooking, baking,
  resting, marinating, chilling, boiling, or simmering — convert stated times
  to seconds (e.g. "12-15 minutes" → use the midpoint, 810). Omit (use null)
  only for purely active hands-on steps with no waiting involved.

Return the JSON array now.`;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

async function findMealPhoto(dishName: string): Promise<string | null> {
  if (!process.env.PEXELS_API_KEY) return null;

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(dishName)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );

    if (!res.ok) {
      console.error(`Pexels search failed for "${dishName}": ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data.photos?.[0]?.src?.landscape ?? null;
  } catch (err) {
    // A missing photo shouldn't break meal generation — log and move on.
    console.error(`Pexels lookup error for "${dishName}":`, err);
    return null;
  }
}
