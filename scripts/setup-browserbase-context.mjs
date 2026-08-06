#!/usr/bin/env node
// scripts/setup-browserbase-context.mjs
//
// One-time manual setup, run locally: creates a persisted Browserbase
// context, opens a live view of that session, and waits while you log
// into the target Google account and authorize the "Grocery Shopper for
// Google Sheets" add-on by hand, exactly once.
//
// app/lib/instacart-automation.ts reuses this same authenticated context
// on every real run afterward and never attempts to log in itself — which
// is what avoids tripping Google's automated-login / CAPTCHA detection on
// every order. If you ever need to re-auth (session revoked, add-on
// re-permissioned, etc.), just re-run this script to mint a fresh context.
//
// Usage:
//   BROWSERBASE_API_KEY=... BROWSERBASE_PROJECT_ID=... node scripts/setup-browserbase-context.mjs
//
// Prints a BROWSERBASE_CONTEXT_ID at the end — save that as an env var
// (.env.local and Vercel) alongside BROWSERBASE_API_KEY/PROJECT_ID.

import Browserbase from "@browserbasehq/sdk";
import readline from "node:readline/promises";

const apiKey = process.env.BROWSERBASE_API_KEY;
const projectId = process.env.BROWSERBASE_PROJECT_ID;

if (!apiKey || !projectId) {
  console.error("Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID first.");
  process.exit(1);
}

const bb = new Browserbase({ apiKey });

const context = await bb.contexts.create({ projectId });
console.log(`Created Browserbase context: ${context.id}`);

const session = await bb.sessions.create({
  projectId,
  browserSettings: { context: { id: context.id, persist: true } },
  keepAlive: true,
  timeout: 900, // give yourself up to 15 minutes to do this by hand
});

const live = await bb.sessions.debug(session.id);

console.log("\nOpen this URL, then inside that browser:");
console.log("  1. Log into the Google account the app should use.");
console.log("  2. Open the grocery sheet (same GOOGLE_SHEET_ID the app uses).");
console.log("  3. Extensions > Grocery Shopper for Google Sheets > Open —");
console.log("     approve any permission prompts so the add-on is fully");
console.log("     authorized on this account.");
console.log("\n" + live.debuggerFullscreenUrl + "\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question("Press Enter once you've logged in and authorized the add-on... ");
rl.close();

await bb.sessions.update(session.id, { projectId, status: "REQUEST_RELEASE" });

console.log("\nDone. Save these as env vars (.env.local + Vercel):\n");
console.log(`BROWSERBASE_CONTEXT_ID=${context.id}`);
