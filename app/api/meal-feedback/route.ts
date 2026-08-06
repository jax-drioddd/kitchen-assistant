// app/api/meal-feedback/route.ts
//
// Records a rating or skip for a meal. This is what closes the loop —
// /api/generate-week already reads meal_history to avoid repeating recent
// meals and to steer away from anything rated poorly.
//
// When status is "cooked", also estimates inventory depletion: Claude
// reasons about what was likely used from current stock, the same way a
// person eyeballing their pantry would — not exact unit-reconciliation,
// which needs receipt-level input to be genuinely accurate. Best-effort:
// if this fails, the rating/skip itself still gets recorded.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { meal_id, status, rating } = await req.json();

    if (!meal_id || !status) {
      return NextResponse.json({ error: "meal_id and status are required" }, { status: 400 });
    }

    const { error } = await supabase.from("meal_history").insert({
      meal_id,
      date: new Date().toISOString().slice(0, 10),
      status, // "cooked" | "skipped"
      rating: rating ?? null,
    });

    if (error) throw new Error(error.message);

    if (status === "cooked") {
      try {
        await estimateDepletion(meal_id);
      } catch (depErr) {
        console.error("Inventory depletion estimate failed, non-fatal:", depErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("meal-feedback error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

async function estimateDepletion(mealId: string) {
  const { data: meal } = await supabase
    .from("meals")
    .select("ingredients")
    .eq("id", mealId)
    .single();

  const { data: inventory } = await supabase.from("inventory").select("*");

  if (!meal || !inventory || inventory.length === 0) return; // nothing tracked yet, nothing to deplete

  const prompt = `You are estimating kitchen inventory levels after cooking a meal —
the way a person eyeballing their pantry would, not exact unit conversion.

Current inventory:
${inventory.map((i: any) => `id ${i.id}: ${i.quantity} ${i.unit} ${i.item}`).join("\n")}

Ingredients used in the meal just cooked:
${(meal.ingredients as any[]).map((ing) => `${ing.quantity} ${ing.unit} ${ing.name}`).join("\n")}

For each inventory item that was plausibly used by this meal, estimate its new
quantity. Only include inventory items you're reasonably confident were
affected — skip anything unrelated. If an item is fully used up, set its new
quantity to 0 (don't remove it from consideration).

Respond with ONLY valid JSON, no markdown fences, no preamble:
[{ "id": "the inventory id", "new_quantity": number }]

If nothing in inventory was plausibly used, respond with an empty array: []`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`);

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === "text");
  const rawText = textBlock?.text ?? "[]";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  let updates: { id: string; new_quantity: number }[];
  try {
    updates = JSON.parse(cleaned);
  } catch {
    console.error("Depletion estimate returned non-JSON, skipping:", rawText.slice(0, 300));
    return;
  }

  for (const update of updates) {
    await supabase
      .from("inventory")
      .update({ quantity: Math.max(0, update.new_quantity), last_updated: new Date().toISOString() })
      .eq("id", update.id);
  }
}
