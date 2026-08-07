// app/api/grocery-list/route.ts
//
// Pulls the current week's meals, dedupes ingredients across all 7 days,
// filters out pantry staples, converts recipe quantities into real
// purchasable amounts (you can't buy "1 tbsp fresh dill", you buy "1
// bunch" — see app/lib/purchaseUnits.ts), writes the result to a Google
// Sheet, and credits inventory with the full purchase amount so leftover
// stock is tracked for future weeks.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import { convertUnit } from "../../lib/units";
import { getOrEstimatePurchaseUnit, computePurchaseQuantity } from "../../lib/purchaseUnits";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
}

interface Meal {
  id: string;
  ingredients: Ingredient[];
}

interface ShoppingItem extends Ingredient {
  purchase_display: string; // what to actually search for / buy
  inventory_credit_quantity: number; // what gets added to inventory (may exceed what the recipe needed)
  inventory_credit_unit: string;
}

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function dedupeIngredients(meals: Meal[], pantryStaples: string[]): Ingredient[] {
  const staplesSet = new Set(pantryStaples.map((s) => s.toLowerCase().trim()));
  const combined = new Map<string, Ingredient>();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      const nameKey = ing.name.toLowerCase().trim();
      if (staplesSet.has(nameKey)) continue;

      const key = `${nameKey}|${ing.unit}`;
      if (combined.has(key)) {
        combined.get(key)!.quantity += ing.quantity;
      } else {
        combined.set(key, { ...ing });
      }
    }
  }

  return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Converts deduped recipe quantities into real purchasable amounts. Runs
// the (possibly-cached) purchase-unit lookup for every ingredient in
// parallel, since these are independent per-ingredient and sequential
// calls would make grocery-list generation noticeably slower.
async function buildShoppingList(deduped: Ingredient[]): Promise<ShoppingItem[]> {
  return Promise.all(
    deduped.map(async (ing): Promise<ShoppingItem> => {
      const info = await getOrEstimatePurchaseUnit(ing.name, ing.unit);
      const purchase = computePurchaseQuantity(ing.quantity, ing.unit, info);

      if (!purchase) {
        // Already a real purchase unit (lb, oz, or a countable whole item) —
        // no conversion needed, use the recipe quantity as-is.
        const qtyStr = ing.unit ? `${ing.quantity} ${ing.unit}` : `${ing.quantity}`;
        return {
          ...ing,
          purchase_display: `${qtyStr} ${ing.name}`,
          inventory_credit_quantity: ing.quantity,
          inventory_credit_unit: ing.unit,
        };
      }

      const unitLabel = info.label ?? "unit";
      const plural = purchase.purchaseUnitsToBuy === 1 ? unitLabel : `${unitLabel}s`;
      return {
        ...ing,
        purchase_display: `${purchase.purchaseUnitsToBuy} ${plural} ${ing.name}`,
        inventory_credit_quantity: purchase.recipeEquivalentBought,
        inventory_credit_unit: purchase.recipeEquivalentUnit,
      };
    })
  );
}

export async function POST(_req: NextRequest) {
  try {
    const weekStart = getMonday(new Date());
    const { data: plan } = await supabase
      .from("weekly_plans")
      .select("*")
      .eq("week_start", weekStart)
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: "No meal plan found for this week. Generate one first." },
        { status: 400 }
      );
    }

    const mealIds = Object.values(plan.days) as string[];
    const { data: meals } = await supabase
      .from("meals")
      .select("id, ingredients")
      .in("id", mealIds);

    if (!meals || meals.length === 0) {
      return NextResponse.json({ error: "No meals found for this week." }, { status: 400 });
    }

    const { data: prefs } = await supabase
      .from("preferences")
      .select("pantry_staples")
      .single();

    const deduped = dedupeIngredients(meals as Meal[], prefs?.pantry_staples ?? []);
    const shoppingList = await buildShoppingList(deduped);

    // Auth with Google
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "A1:Z1000",
    });

    // Uses purchase_display, not raw recipe quantities — "1 bunch fresh
    // dill", not "1 tbsp fresh dill". This is what someone would actually
    // search for and buy.
    const rows = [["Item"], ...shoppingList.map((item) => [item.purchase_display])];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    await supabase.from("grocery_lists").upsert({
      week_start: weekStart,
      deduped_items: deduped,
      sheet_url: sheetUrl,
    });

    // Credit inventory with the full purchase amount, not just what the
    // recipe needed — buying a whole bunch of dill for a 1-tbsp need
    // leaves real leftover stock, and inventory should reflect that so
    // future weeks can actually reuse it.
    try {
      for (const item of shoppingList) {
        const { data: candidates } = await supabase
          .from("inventory")
          .select("id, quantity, unit")
          .ilike("item", item.name);

        const existing = candidates?.find(
          (c) => convertUnit(1, item.inventory_credit_unit ?? "", c.unit) !== null
        );

        if (existing) {
          const converted =
            convertUnit(item.inventory_credit_quantity, item.inventory_credit_unit ?? "", existing.unit) ??
            item.inventory_credit_quantity;
          await supabase
            .from("inventory")
            .update({
              quantity: existing.quantity + converted,
              last_updated: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("inventory").insert({
            item: item.name,
            quantity: item.inventory_credit_quantity,
            unit: item.inventory_credit_unit ?? "",
          });
        }
      }
    } catch (invErr) {
      console.error("Inventory update (grocery purchase) failed, non-fatal:", invErr);
    }

    return NextResponse.json({ sheet_url: sheetUrl, items: shoppingList });
  } catch (err: any) {
    console.error("grocery-list error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
