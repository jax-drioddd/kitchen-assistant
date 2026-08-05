// app/api/meal-feedback/route.ts
//
// Records a rating or skip for a meal. This is what closes the loop —
// /api/generate-week already reads meal_history to avoid repeating recent
// meals and to steer away from anything rated poorly, so writing real rows
// here is the only piece that was missing.

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
      rating: rating ?? null, // 1-5, or null for skips
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("meal-feedback error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
