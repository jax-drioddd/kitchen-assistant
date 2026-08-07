// app/api/dev-seed-photos/route.ts
//
// One-time demo-prep utility: backfills real Pexels photos onto the 6
// hand-seeded "last week" history meals (demo-seed.sql), since those were
// inserted directly via SQL and never went through the normal generation
// flow that calls findMealPhoto(). Reuses that exact same lookup — same
// credentials, same stable Pexels CDN URLs, same licensing as every other
// photo in the app — rather than hand-picking arbitrary web images.
//
// Visit this URL once in a browser (GET request) after running
// demo-seed.sql. Safe to leave in place afterward — it only touches the
// 6 fixed seed meal ids, nothing else, and is idempotent to re-run.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SEED_MEAL_IDS = [
  "a1000000-0000-0000-0000-000000000001",
  "a1000000-0000-0000-0000-000000000002",
  "a1000000-0000-0000-0000-000000000003",
  "a1000000-0000-0000-0000-000000000004",
  "a1000000-0000-0000-0000-000000000005",
  "a1000000-0000-0000-0000-000000000006",
];

async function findMealPhoto(dishName: string): Promise<string | null> {
  if (!process.env.PEXELS_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(dishName)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: process.env.PEXELS_API_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.photos?.[0]?.src?.landscape ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const results: { id: string; name: string; image_url: string | null }[] = [];

  for (const id of SEED_MEAL_IDS) {
    const { data: meal } = await supabase.from("meals").select("id, name").eq("id", id).single();
    if (!meal) continue;

    const imageUrl = await findMealPhoto(meal.name);
    await supabase.from("meals").update({ image_url: imageUrl }).eq("id", id);
    results.push({ id: meal.id, name: meal.name, image_url: imageUrl });
  }

  return NextResponse.json({ updated: results.length, results });
}
