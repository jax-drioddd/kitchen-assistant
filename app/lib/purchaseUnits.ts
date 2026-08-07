// app/lib/purchaseUnits.ts
//
// Server-only — calls Claude and Supabase directly, never import this from
// a "use client" component.
//
// Recipe quantities ("1 tbsp fresh dill") and real purchasable quantities
// ("1 bunch") are genuinely different things. This maps between them:
// Claude estimates the real-world purchase unit for an ingredient the first
// time it's seen, and the result is cached in ingredient_purchase_units so
// every future week for the same ingredient is an instant lookup, not a
// repeat API call.

import { createClient } from "@supabase/supabase-js";
import { convertUnit } from "./units";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface PurchaseUnitInfo {
  needsPurchaseUnit: boolean;
  label: string | null;
  quantityPerUnit: number | null;
  recipeUnit: string | null;
}

export async function getOrEstimatePurchaseUnit(
  ingredientName: string,
  recipeUnit: string
): Promise<PurchaseUnitInfo> {
  const normalized = ingredientName.toLowerCase().trim();

  const { data: existing } = await supabase
    .from("ingredient_purchase_units")
    .select("*")
    .eq("ingredient_name", normalized)
    .maybeSingle();

  if (existing) {
    return {
      needsPurchaseUnit: existing.needs_purchase_unit,
      label: existing.purchase_unit_label,
      quantityPerUnit: existing.purchase_unit_quantity,
      recipeUnit: existing.purchase_unit_recipe_unit,
    };
  }

  const estimated = await estimateViaClaude(normalized, recipeUnit);

  // Cache regardless of outcome — "this one doesn't need conversion" is a
  // real, reusable answer too, and avoids re-asking every week.
  await supabase.from("ingredient_purchase_units").insert({
    ingredient_name: normalized,
    needs_purchase_unit: estimated.needsPurchaseUnit,
    purchase_unit_label: estimated.label,
    purchase_unit_quantity: estimated.quantityPerUnit,
    purchase_unit_recipe_unit: estimated.recipeUnit,
  });

  return estimated;
}

async function estimateViaClaude(
  ingredientName: string,
  recipeUnit: string
): Promise<PurchaseUnitInfo> {
  const prompt = `You're helping figure out real grocery shopping for one ingredient.

Ingredient: "${ingredientName}"
Recipe measures it in: "${recipeUnit || "count (whole items)"}"

Is this recipe unit already how someone would actually buy this at a grocery
store (e.g. sold by the pound/oz like most meat and produce, or a whole
countable item like "2 onions")? Or does it need converting to a real
purchase unit (e.g. fresh dill is measured in tbsp for recipes, but bought as
"1 bunch"; soy sauce is measured in tbsp/cup but bought as a "16 fl oz
bottle")?

Respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "needs_purchase_unit": boolean,
  "purchase_unit_label": "string or null - e.g. 'bunch', '16 fl oz bottle', 'head', 'jar' - null if needs_purchase_unit is false",
  "purchase_unit_quantity": number or null - how many of the recipe unit below one purchase unit typically contains,
  "purchase_unit_recipe_unit": "string or null - a SHORT unit token only: tsp, tbsp, cup, fl oz, lb, oz, g, kg, ml, l, or \"count\" for whole/countable items. Never a descriptive phrase like \"count (whole items)\" - just the bare word."
}

Use your best real-world knowledge of typical grocery store package sizes.
This is a reasonable estimate, not a receipt lookup.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      return { needsPurchaseUnit: false, label: null, quantityPerUnit: null, recipeUnit: null };
    }

    const data = await response.json();
    const textBlock = data.content?.find((b: any) => b.type === "text");
    const rawText = textBlock?.text ?? "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      needsPurchaseUnit: !!parsed.needs_purchase_unit,
      label: parsed.purchase_unit_label ?? null,
      quantityPerUnit: parsed.purchase_unit_quantity ?? null,
      recipeUnit: parsed.purchase_unit_recipe_unit ?? null,
    };
  } catch (err) {
    // Fail safe: treat as "no conversion needed" rather than breaking the
    // whole grocery list over one ingredient estimate failing.
    console.error(`Purchase unit estimate failed for "${ingredientName}":`, err);
    return { needsPurchaseUnit: false, label: null, quantityPerUnit: null, recipeUnit: null };
  }
}

// Given how much a recipe needs, figures out how many purchase units to buy
// (rounding up — you can't buy a fraction of a bunch) and how much
// recipe-unit-equivalent that purchase actually represents. The latter is
// what should get added to inventory: buying a whole bunch for a 1-tbsp
// need leaves real leftover stock for future weeks, and inventory should
// reflect that, not just what was strictly used.
export function computePurchaseQuantity(
  neededQuantity: number,
  neededUnit: string,
  info: PurchaseUnitInfo
): { purchaseUnitsToBuy: number; recipeEquivalentBought: number; recipeEquivalentUnit: string } | null {
  if (!info.needsPurchaseUnit || !info.quantityPerUnit || !info.recipeUnit) return null;

  const convertedNeeded = convertUnit(neededQuantity, neededUnit, info.recipeUnit) ?? neededQuantity;
  const purchaseUnitsToBuy = Math.max(1, Math.ceil(convertedNeeded / info.quantityPerUnit));
  const recipeEquivalentBought = purchaseUnitsToBuy * info.quantityPerUnit;

  return {
    purchaseUnitsToBuy,
    recipeEquivalentBought,
    recipeEquivalentUnit: info.recipeUnit,
  };
}
