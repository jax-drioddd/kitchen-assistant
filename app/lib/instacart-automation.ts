// app/lib/instacart-automation.ts
//
// Drives an already-authenticated, persisted Browserbase session through
// the flow that used to be manual: open the grocery sheet, select column A,
// trigger the "Grocery Shopper for Google Sheets" add-on's Instacart
// handoff, and capture the resulting cart URL.
//
// IMPORTANT — needs a live dry run before it's reliable. The selectors
// below for the add-on's sidebar are best-effort; Playwright can't be
// pointed at the exact DOM without opening the sheet and add-on live and
// watching what actually renders. Run against a real Browserbase session
// (see scripts/setup-browserbase-context.mjs and the README) and fix any
// selector marked CONFIRM LIVE below against what you actually see.
//
// Also requires a one-time manual setup: a persisted Browserbase context
// that already has the target Google account logged in and the add-on
// authorized. This code never attempts to log in itself — reusing a
// pre-authenticated context is what keeps every real run from tripping
// Google's automated-login / CAPTCHA detection. See
// scripts/setup-browserbase-context.mjs for that one-time step.

import { chromium, type Page, type BrowserContext } from "playwright-core";
import Browserbase from "@browserbasehq/sdk";

const SELECT_COLUMN_A_RANGE = "A:A";

export interface InstacartAutomationResult {
  cartUrl: string;
  sessionReplayUrl: string;
}

export async function openInstacartCart(
  sheetUrl: string
): Promise<InstacartAutomationResult> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  const contextId = process.env.BROWSERBASE_CONTEXT_ID;

  if (!apiKey || !projectId || !contextId) {
    throw new Error(
      "Missing BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, or BROWSERBASE_CONTEXT_ID. " +
        "Run scripts/setup-browserbase-context.mjs once to create the authenticated context."
    );
  }

  const bb = new Browserbase({ apiKey });

  const session = await bb.sessions.create({
    projectId,
    browserSettings: {
      context: { id: contextId, persist: true },
    },
    // The Sheets + add-on + Instacart handoff can genuinely take a while;
    // give it room rather than timing out mid-flow.
    timeout: 180,
  });

  const sessionReplayUrl = `https://www.browserbase.com/sessions/${session.id}`;

  const browser = await chromium.connectOverCDP(session.connectUrl);

  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    const cartUrl = await runFlow(page, context, sheetUrl);
    return { cartUrl, sessionReplayUrl };
  } finally {
    await browser.close().catch(() => {});
    await bb.sessions
      .update(session.id, { projectId, status: "REQUEST_RELEASE" })
      .catch(() => {});
  }
}

async function runFlow(
  page: Page,
  context: BrowserContext,
  sheetUrl: string
): Promise<string> {
  // 1. Open the sheet.
  await page.goto(sheetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Sheets is a heavy SPA — wait for the grid to actually be interactive
  // rather than trusting domcontentloaded.
  await page.waitForSelector("#t-name-box", { timeout: 60_000 });

  // 2. Select column A via the Name Box — more reliable than clicking
  //    cells directly, and matches "highlight the ingredient column".
  const nameBox = page.locator("#t-name-box");
  await nameBox.click();
  await nameBox.fill(SELECT_COLUMN_A_RANGE);
  await page.keyboard.press("Enter");

  // 3. Open the add-on from the Extensions menu.
  //    CONFIRM LIVE: exact menu item text/role for "Extensions" and for
  //    "Grocery Shopper for Google Sheets" inside it — Sheets' menu
  //    structure and add-on submenu naming should be verified against the
  //    live DOM, not assumed from here.
  await page.getByRole("menuitem", { name: /extensions/i }).click();
  await page.getByText(/grocery shopper for google sheets/i).click();

  // Some add-ons need an explicit "Open" the first time, then stay open as
  // a sidebar afterward. Handle both.
  const openMenuItem = page.getByText(/^open$/i);
  if (await openMenuItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await openMenuItem.click();
  }

  // 4. The add-on renders inside an iframe sidebar.
  //    CONFIRM LIVE: the iframe's actual src pattern / title. Apps Script
  //    sidebars are typically served from script.google.com or
  //    n-*.googleusercontent.com — check which one this add-on uses.
  const sidebar = page.frameLocator('iframe[src*="script.google"]');

  // 5. Click "Open with Instacart" inside the sidebar.
  //    CONFIRM LIVE: exact button text/role.
  const openWithInstacart = sidebar.getByText(/open with instacart/i);
  await openWithInstacart.waitFor({ timeout: 30_000 });

  // This likely opens Instacart in a new tab — race the click against a
  // popup event so we catch it regardless of which happens first.
  const [popup] = await Promise.all([
    context.waitForEvent("page", { timeout: 60_000 }).catch(() => null),
    openWithInstacart.click(),
  ]);

  let cartPage = popup;

  if (!cartPage) {
    // No popup fired — the add-on may show a second in-sidebar
    // confirmation step before navigating.
    // CONFIRM LIVE: exact button text if this branch is the one that
    // actually fires for this add-on.
    const continueButton = sidebar.getByText(/continue to instacart/i);
    if (await continueButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const [maybePopup] = await Promise.all([
        context.waitForEvent("page", { timeout: 60_000 }).catch(() => null),
        continueButton.click(),
      ]);
      cartPage = maybePopup;
    }
  }

  if (!cartPage) {
    throw new Error(
      "Instacart cart page never opened — the add-on's flow likely doesn't " +
        "match what this script expects. Re-run against a live Browserbase " +
        "session and watch the replay to see what actually happened."
    );
  }

  await cartPage.waitForLoadState("domcontentloaded", { timeout: 60_000 });
  // Give Instacart's client-side cart matching a moment to settle before
  // handing the URL back, so the user doesn't land on a half-built cart.
  await cartPage.waitForURL(/instacart\.com/, { timeout: 60_000 }).catch(() => {});

  return cartPage.url();
}
