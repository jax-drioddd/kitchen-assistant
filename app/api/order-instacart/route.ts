// app/api/order-instacart/route.ts
//
// Triggers the Browserbase automation that replaces the old manual steps
// (open the sheet, highlight column A, click through the add-on): drives
// an already-authenticated headless browser through that exact flow and
// returns the resulting Instacart cart URL so the client can redirect the
// user straight to it — no visible intermediate sheet or add-on UI.
//
// Assumes /api/grocery-list has already run for this week (the "Order on
// Instacart" button only renders once a grocery list exists), so the sheet
// is already populated with the current list — this route doesn't rewrite
// it, just drives the handoff from there.

import { NextResponse } from "next/server";
import { openInstacartCart } from "../../lib/instacart-automation";

// Sheets + the add-on + Instacart's own page load can genuinely take
// 30-90s end to end. This needs a Vercel plan whose function duration
// limit covers that (Hobby caps around 60s; Pro/Fluid compute can go
// higher) — bump this to match whatever your plan actually allows.
export const maxDuration = 90;

export async function POST() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return NextResponse.json(
      { error: "GOOGLE_SHEET_ID is not configured." },
      { status: 500 }
    );
  }

  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  try {
    const { cartUrl, sessionReplayUrl } = await openInstacartCart(sheetUrl);
    console.log("order-instacart session replay:", sessionReplayUrl);
    return NextResponse.json({ cart_url: cartUrl });
  } catch (err: any) {
    console.error("order-instacart error:", err);
    return NextResponse.json(
      { error: err.message ?? "Couldn't open the Instacart cart. Try again." },
      { status: 500 }
    );
  }
}
