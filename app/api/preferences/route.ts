// app/api/preferences/route.ts
//
// GET returns the current (single-row) preferences, POST upserts them.
// No auth/multi-user logic — matches the rest of the app's single-user scope.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase.from("preferences").select("*").single();

  if (error || !data) {
    // No row yet — return sensible defaults so the form has something to show
    return NextResponse.json({
      dislikes: [],
      time_budget_minutes: 45,
      skill_level: "intermediate",
      cuisine_leanings: [],
      pantry_staples: [],
    });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { dislikes, time_budget_minutes, skill_level, cuisine_leanings, pantry_staples } = body;

    // Single-row table: update the existing row if one exists, otherwise insert
    const { data: existing } = await supabase.from("preferences").select("id").single();

    if (existing) {
      const { error } = await supabase
        .from("preferences")
        .update({ dislikes, time_budget_minutes, skill_level, cuisine_leanings, pantry_staples })
        .eq("id", existing.id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("preferences")
        .insert({ dislikes, time_budget_minutes, skill_level, cuisine_leanings, pantry_staples });

      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("preferences save error:", err);
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
