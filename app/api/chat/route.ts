// app/api/chat/route.ts
//
// Takes a message like "swap Wednesday, I don't feel like chicken", figures
// out which day to change and what to replace it with, updates Supabase,
// and returns a reply plus the updated meal so the dashboard can patch its
// view without a full page reload.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Preferences {
  dislikes: string[];
  time_budget_minutes: number;
  skill_level: string;
  cuisine_leanings: string[];
  pantry_staples: string[];
  default_servings: number;
}

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // 1. Load current week's plan + meals, and preferences
    const weekStart = getMonday(new Date());
    const { data: plan } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("week_start", weekStart)
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: "No plan exists for this week yet. Generate one first." },
        { status: 400 }
      );
    }

    const mealIds = Object.values(plan.days) as string[];
    const { data: meals } = await supabase
      .from("meals")
      .select("*")
      .in("id", mealIds);

    const { data: prefs } = await supabase
      .from("preferences")
      .select("*")
      .single();

    const { data: inventory } = await supabase
      .from("inventory")
      .select("item, quantity, unit")
      .gt("quantity", 0);

    // Build a day -> meal name summary for context (keep it light, not the
    // full ingredient lists, to keep the prompt focused)
    const currentPlanSummary = Object.entries(plan.days)
      .map(([day, mealId]) => {
        const meal = meals?.find((m: any) => m.id === mealId);
        return `${day}: ${meal?.name ?? "unknown"}`;
      })
      .join("\n");

    // 2. Ask Claude to interpret the request and generate a replacement
    const prompt = buildChatPrompt(message, currentPlanSummary, prefs as Preferences, inventory ?? []);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find((block: any) => block.type === "text");
    const rawText = textBlock?.text ?? "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let result: {
      day: string;
      reply: string;
      meal: {
        name: string;
        ingredients: { id: string; name: string; quantity: number; unit: string }[];
        instructions: { title: string; content: string; timer_seconds: number | null }[];
        tags: string[];
      };
    };

    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error("Model did not return valid JSON. Raw response: " + rawText.slice(0, 500));
    }

    // 3. Save the new meal, repoint that day in weekly_plans to it
    const imageUrl = await findMealPhoto(result.meal.name);
    const servings = (prefs as Preferences)?.default_servings ?? 2;

    const { data: inserted, error: insertError } = await supabase
      .from("meals")
      .insert({
        name: result.meal.name,
        ingredients: result.meal.ingredients,
        instructions: result.meal.instructions,
        tags: result.meal.tags,
        image_url: imageUrl,
        base_servings: servings,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw new Error(`Failed to save swapped meal: ${insertError?.message}`);
    }

    const updatedDays = { ...plan.days, [result.day]: inserted.id };
    const { error: updateError } = await supabase
      .from("weekly_plans")
      .update({ days: updatedDays })
      .eq("week_start", weekStart);

    if (updateError) throw new Error(`Failed to update plan: ${updateError.message}`);

    return NextResponse.json({
      reply: result.reply,
      updated_day: result.day,
      meal: {
        id: inserted.id,
        day: result.day,
        name: result.meal.name,
        ingredients: result.meal.ingredients,
        instructions: result.meal.instructions,
        tags: result.meal.tags,
        image_url: imageUrl,
        base_servings: servings,
      },
    });
  } catch (err: any) {
    console.error("chat error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
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
    console.error(`Pexels lookup error for "${dishName}":`, err);
    return null;
  }
}

function buildChatPrompt(
  message: string,
  currentPlanSummary: string,
  prefs: Preferences,
  inventory: { item: string; quantity: number; unit: string }[]
): string {
  const inventoryList = inventory.length > 0
    ? inventory.map((i) => `${i.quantity} ${i.unit} ${i.item}`).join(", ")
    : "nothing tracked yet";

  return `You are helping someone adjust their weekly meal plan through conversation.

Current plan:
${currentPlanSummary}

Their request: "${message}"

Figure out which single day they want changed, and generate one replacement
meal for that day. If the request doesn't clearly name or imply a specific
day, use your best judgment based on context (e.g. "I don't feel like cooking
tonight" with no day named — pick the soonest upcoming day in the list).

Respond with ONLY valid JSON, no markdown fences, no preamble, in this shape:
{
  "day": "Wednesday",
  "reply": "One short, natural sentence confirming what you changed and why.",
  "meal": {
    "name": "string",
    "ingredients": [{ "id": "0001", "name": "string", "quantity": number, "unit": "string" }],
    "instructions": [
      {
        "title": "short summary, e.g. 'Sear the chicken'",
        "content": "the instruction text, referencing ingredients by placeholder like {0001} instead of writing the amount out",
        "timer_seconds": 300
      }
    ],
    "tags": ["string"]
  }
}

Hard constraints for the new meal:
- Never use these disliked ingredients in any form: ${prefs?.dislikes?.join(", ") || "none"}
- Cookable within ${prefs?.time_budget_minutes ?? 45} minutes
- Skill level: ${prefs?.skill_level ?? "intermediate"}
- Cuisine leanings to favor (not exclusive, just weighted toward): ${prefs?.cuisine_leanings?.join(", ") || "no strong preference"}
- Assume these pantry staples are on hand, don't include them in ingredients: ${prefs?.pantry_staples?.join(", ") || "none"}
- Current kitchen inventory (soft preference, not required): ${inventoryList}. Prefer using it up where it fits naturally, don't force it.
- Should be genuinely different from what it's replacing — if they said "not chicken," don't substitute another chicken dish
- Plan quantities for ${prefs?.default_servings ?? 2} servings, matching the rest of the week

Ingredient formatting (matters for downstream deduping AND servings scaling):
- id: unique 4-digit string per ingredient within this meal (e.g. "0001")
- Consistent singular names ("chicken breast" not "chicken breasts")
- Countable items: quantity is the count, unit is "" (e.g. {"name": "egg", "quantity": 4, "unit": ""})
- Measured items: standard units only (lb, oz, cup, tbsp, tsp, g, ml)
- Real numbers only, never "a handful" or "to taste"

Step formatting (powers step-by-step cooking mode with timers AND live servings-scaling):
- One clear action per step, not paragraphs
- title: short 2-5 word summary
- content: CRITICAL — reference every ingredient amount via its placeholder
  token (e.g. {0001}), never write the amount as plain text. Example:
  "Whisk together {0001} and {0002}." NOT "Whisk together 2 tbsp fish sauce
  and 1 tsp sugar." The placeholder is replaced with the correctly-scaled
  amount at display time; plain-text amounts break when servings change.
- timer_seconds: include for any waiting/cooking/baking/resting/simmering
  step, converted to seconds (use the midpoint for a range). Omit (null) for
  purely active steps with no waiting.

Return the JSON object now.`;
}
