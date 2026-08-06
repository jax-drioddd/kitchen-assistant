# Kitchen Assistant 🍽️

An AI-powered weekly meal planner that goes all the way to a filled grocery
cart — not just recipe ideas.

**Live:** [kitchenassistant-alpha.vercel.app](https://kitchenassistant-alpha.vercel.app)

## The problem

Deciding what to eat every day is real, recurring mental and physical work.
The usual workaround — asking an AI for recipe ideas, then ingredients, then
instructions, as three separate prompts — has no memory between sessions and
no path from "here's what to cook" to "groceries are in my cart." This closes
that gap.

## What it does

- **Generates a week of meals** tailored to your preferences (dislikes, time
  budget, skill level, cuisine leanings), and avoids repeating recent meals
  or anything you've rated poorly
- **Chat-based refinement** — "swap Wednesday, I don't feel like chicken"
  updates just that day without regenerating the whole week
- **A fast "Today" view** for daily use, separate from the full planner —
  shows what you're cooking right now with a day-picker to peek at any other
  planned day
- **Cooking mode** — full-screen, step-by-step instructions with independent
  per-step timers that keep running in the background regardless of
  navigation, and an optional split-screen view for working on two steps at
  once (e.g. a timer step and active prep happening in parallel)
- **Deduped grocery list** across the whole week, with a one-click path to a
  real, pre-matched Instacart cart
- **Feedback loop** — rating or skipping a meal feeds directly into what
  future weeks avoid generating
- **Editable preferences** — dislikes, cuisine leanings, pantry staples, time
  budget, and skill level, all changeable from the UI

## How the Instacart integration actually works

Instacart's own Developer Platform is currently closed to new applicants, so
this uses a different path: the app writes a deduped grocery list into a
persistent Google Sheet (via the Sheets API), and a third-party Google
Workspace add-on ("Grocery Shopper for Google Sheets") handles the handoff
to a real, matched Instacart cart from there.

Clicking "Order on Instacart" no longer requires opening that sheet by
hand. `/api/order-instacart` drives a headless, already-authenticated
browser session (via [Browserbase](https://browserbase.com)) through the
same steps a person would do manually — open the sheet, select column A,
click "Open with Instacart" inside the add-on's sidebar — and redirects the
user straight to the resulting cart. See
`app/lib/instacart-automation.ts` for the flow itself.

This requires a one-time manual setup step, since the app can't log into a
personal Google account on its own: run
`pnpm setup:browserbase-context` locally, which opens a live browser view
for you to log in and authorize the add-on once. That session's auth state
gets persisted as a Browserbase "context" and reused on every real run
afterward, so production never has to log in itself — which is also what
keeps it from tripping Google's automated-login / CAPTCHA detection on
every order.

**Known fragility, not yet hardened:** the add-on's sidebar selectors in
`instacart-automation.ts` are best-effort and marked `CONFIRM LIVE` where
they most need checking against the real DOM — this needs one dry run
against a real Browserbase session before it's trustworthy end to end. It's
also inherently coupled to a third-party add-on's UI, which can change
without notice.

## Tech stack

- **Next.js** (App Router) + **Tailwind CSS**
- **Supabase** (Postgres) for all persistent data
- **Claude API** (Sonnet) for meal generation, chat-based swaps, and
  step/timer structuring
- **Pexels API** for recipe photos
- **Google Sheets API** for the grocery list → Instacart handoff
- Deployed on **Vercel**

## Local development

```bash
pnpm install
```

Create `.env.local` with:
```
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SHEET_ID=
GOOGLE_CREDENTIALS_JSON=
PEXELS_API_KEY=
BROWSERBASE_API_KEY=
BROWSERBASE_PROJECT_ID=
BROWSERBASE_CONTEXT_ID=
```

`BROWSERBASE_CONTEXT_ID` comes from running
`pnpm setup:browserbase-context` once (see above) — it doesn't exist until
you do.

Run the schema in `schema.sql` against your Supabase project via the SQL
Editor, then:

```bash
pnpm dev
```

## What's next

- Meal history / calendar view — the data already exists in `meal_history`,
  this is primarily a display layer
- Simple manual inventory tracking (deliberately not full unit-reconciled
  depletion — that's a genuinely harder problem, scoped as a later phase)
- Browser-automation to eliminate the manual Google Sheets step is now
  wired up (`/api/order-instacart` via Browserbase) but needs a live dry
  run to confirm the add-on's sidebar selectors, plus real-world testing
  of how often Google flags the persisted session over time
- Full Instacart Developer Platform integration would remove this whole
  automation layer if their application process reopens for this account
