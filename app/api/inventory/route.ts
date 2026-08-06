// app/api/inventory/route.ts
//
// Full CRUD for manually-managed inventory, plus the read path used by
// generate-week/chat to steer meal planning toward what's already in stock.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .order("item", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// Manual add — "add stuff to inventory not from AI". If an item with the
// same name+unit already exists, adds to its quantity rather than creating
// a duplicate row; otherwise inserts a new one.
export async function POST(req: NextRequest) {
  try {
    const { item, quantity, unit } = await req.json();
    if (!item || quantity === undefined) {
      return NextResponse.json({ error: "item and quantity are required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("inventory")
      .select("id, quantity")
      .ilike("item", item)
      .eq("unit", unit ?? "")
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("inventory")
        .update({ quantity: existing.quantity + Number(quantity), last_updated: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("inventory")
        .insert({ item, quantity: Number(quantity), unit: unit ?? "" });
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

// Manual edit — sets the exact quantity (not additive), for "keep up to
// date on meals that aren't from here."
export async function PATCH(req: NextRequest) {
  try {
    const { id, item, quantity, unit } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase
      .from("inventory")
      .update({ item, quantity: Number(quantity), unit, last_updated: new Date().toISOString() })
      .eq("id", id);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
