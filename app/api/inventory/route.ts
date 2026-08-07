// app/api/inventory/route.ts
//
// Full CRUD for manually-managed inventory, plus the read path used by
// generate-week/chat to steer meal planning toward what's already in stock.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { convertUnit } from "../../lib/units";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .from("inventory")
    .select("*")
    .gt("quantity", 0) // don't show items that have been fully used up
    .order("item", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data ?? [];

  // Attach a friendly purchase-unit fraction where we have one on record
  // (e.g. "3 tbsp" also shown as "¾ bunch") — read-only lookup, doesn't
  // trigger a new estimate for items that have never been through the
  // grocery list (e.g. added manually).
  const itemNames = items.map((i) => i.item.toLowerCase().trim());
  const { data: purchaseUnits } = itemNames.length
    ? await supabase.from("ingredient_purchase_units").select("*").in("ingredient_name", itemNames)
    : { data: [] };

  const withDisplay = items.map((item) => {
    const info = purchaseUnits?.find((p) => p.ingredient_name === item.item.toLowerCase().trim());
    if (!info || !info.needs_purchase_unit || !info.purchase_unit_quantity) {
      return { ...item, purchase_fraction: null };
    }
    const fraction = item.quantity / info.purchase_unit_quantity;
    const rounded = Math.round(fraction * 4) / 4; // nearest quarter, readable without being falsely precise
    return { ...item, purchase_fraction: `${rounded} ${info.purchase_unit_label}` };
  });

  return NextResponse.json({ items: withDisplay });
}

// Manual add — "add stuff to inventory not from AI". Matches existing items
// by name, converting units when possible (e.g. adding "2 tbsp" to an
// existing "0.25 cup" row merges into one, rather than creating a separate
// row just because the unit string differs) rather than requiring an exact
// unit match.
export async function POST(req: NextRequest) {
  try {
    const { item, quantity, unit } = await req.json();
    if (!item || quantity === undefined) {
      return NextResponse.json({ error: "item and quantity are required" }, { status: 400 });
    }

    const { data: candidates } = await supabase
      .from("inventory")
      .select("id, quantity, unit")
      .ilike("item", item);

    const existing = candidates?.find(
      (c) => convertUnit(1, unit ?? "", c.unit) !== null
    );

    if (existing) {
      const converted = convertUnit(Number(quantity), unit ?? "", existing.unit) ?? Number(quantity);
      const { error } = await supabase
        .from("inventory")
        .update({ quantity: existing.quantity + converted, last_updated: new Date().toISOString() })
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
