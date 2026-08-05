// app/api/grocery-list/route.ts
//
// Pulls the current week's meals, dedupes ingredients across all 7 days,
// filters out pantry staples, writes the result to a new Google Sheet,
// shares it with your account, and saves the URL.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

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

function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().slice(0, 10);
}

function dedupeIngredients(
  meals: Meal[],
  pantryStaples: string[]
): Ingredient[] {
  const staplesSet = new Set(pantryStaples.map((s) => s.toLowerCase().trim()));
  const combined = new Map<string, Ingredient>();

  for (const meal of meals) {
    for (const ing of meal.ingredients) {
      const nameKey = ing.name.toLowerCase().trim();
      if (staplesSet.has(nameKey)) continue; // skip assumed pantry staples

      const key = `${nameKey}|${ing.unit}`;
      if (combined.has(key)) {
        combined.get(key)!.quantity += ing.quantity;
      } else {
        combined.set(key, { ...ing });
      }
    }
  }

  return Array.from(combined.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export async function POST(_req: NextRequest) {
  try {
    // 1. Get current week's meals
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

    // 2. Get pantry staples to exclude
    const { data: prefs } = await supabase
      .from("preferences")
      .select("pantry_staples")
      .single();

    const deduped = dedupeIngredients(meals as Meal[], prefs?.pantry_staples ?? []);

    // 3. Auth with Google — reads credentials from an env var (works both
    //    locally and on Vercel) rather than a local file. Vercel's servers
    //    don't have access to google-credentials.json since it's gitignored
    //    and never uploaded; the file's full JSON contents are stored as
    //    GOOGLE_CREDENTIALS_JSON instead.
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON!),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID!;

    // 4. Clear the sheet, then write the deduped list — one item per row,
    //    formatted for the Grocery Shopper add-on's paste/highlight flow.
    //    We write to a pre-existing sheet (shared with the service account
    //    as editor) rather than creating a new one each time, since service
    //    accounts on personal Google accounts have no Drive storage quota
    //    and can't create new files.
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: "A1:Z1000",
    });

    const rows = [
      ["Item"],
      ...deduped.map((ing) => {
        const qty = ing.unit ? `${ing.quantity} ${ing.unit}` : `${ing.quantity}`;
        return [`${qty} ${ing.name}`];
      }),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "A1",
      valueInputOption: "RAW",
      requestBody: { values: rows },
    });

    const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    // 5. Save the URL
    await supabase.from("grocery_lists").upsert({
      week_start: weekStart,
      deduped_items: deduped,
      sheet_url: sheetUrl,
    });

    return NextResponse.json({ sheet_url: sheetUrl, items: deduped });
  } catch (err: any) {
    console.error("grocery-list error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
