# Getting it working — setup & integration checklist

## 0. Deploy it (pick one)

**A — Instant, drag-and-drop (no serverless functions).**
Drop the contents of `/dist` on <https://app.netlify.com/drop>. The whole app
works offline on your device. Integrations (Calendar/Bank/AI) do NOT run on a
drop deploy.

**B — Connect the repo (recommended — enables integrations + auto-deploy).**
1. Netlify → **Add new site → Import an existing project → GitHub**.
2. Pick `bonalti1/RolandoJoanPena`, branch `claude/personal-dashboard-setup-bicgs2`.
   Build command `npm run build`, publish dir `dist` (auto-filled from `netlify.toml`).
3. Deploy. Every push now redeploys automatically, and serverless functions run.

## 1. Install on your phone (2 min)
Open the site URL → iPhone: Share → **Add to Home Screen**. Android: menu → **Install app**.
It runs like a native app, full-screen, offline.

## 2. How storage works (read this once)
- **Text data** (tasks, bills, goals, health metrics, journal text, family) → browser
  `localStorage`, ~5 MB. Plenty for years of text.
- **Recordings + DEXA files** → browser **IndexedDB**, much larger (100s of MB+).
- Data lives **on the device/browser you use** — it is NOT synced across devices yet.
- **Back it up:** Settings → **Export backup** (downloads a JSON). Do this weekly.
  **Import backup** restores it, or moves it to another device.
- Don't "Clear site data" or delete the installed app without exporting first.

## 3. Works with ZERO setup (usable tomorrow, one device)
Home + non-negotiables, Tasks, Work list, Payments, Bank (manual), Calendar (local
events), Health (weight, body-fat, DEXA manual entry + file upload), Family + ideas,
Journal (voice recording + live transcription + summaries), Notifications (browser),
Settings + themes + backup.

## 4. Environment variables (set in Netlify → Site configuration → Environment variables)
| Variable | Turns on | Status |
| --- | --- | --- |
| _(none — paste iCal link in-app)_ | Google Calendar (read-only) | ✅ built — needs functions deployed |
| `OPENAI_API_KEY` | DEXA scan auto-read (Health) | ✅ built — works once set |
| `PLAID_CLIENT_ID`, `PLAID_SECRET` | Live bank balances | ⛔ not built yet |
| `VAPID_PUBLIC_KEY` (+ scheduler) | Phone push notifications | ⛔ not built yet |

## 5. Integration checklist

### OpenAI — DEXA auto-read (real, ~10 min)
- [ ] Create a key at <https://platform.openai.com/api-keys>.
- [ ] Netlify → Environment variables → add `OPENAI_API_KEY`.
- [ ] Redeploy (Deploys → Trigger deploy). Health → upload a scan photo → **Auto-read**.
- Note: the Journal already transcribes in the browser for free; this key is only
  for reading DEXA scan images today.

### Google Calendar — read-only import ✅ built
Requires the repo connected to Netlify (Option B) so the function runs. No API
key or Google Cloud project needed.
1. In Google Calendar (desktop): **Settings** (gear) → left sidebar, click the
   calendar you want under **Settings for my calendars**.
2. Scroll to **Integrate calendar** → copy the **Secret address in iCal format**
   (the long URL ending in `/basic.ics`). Treat it like a password.
3. In the dashboard: **Calendar** page → paste it into **Google Calendar
   (read-only)** → **Sync**. Your events (incl. weekly/daily repeats) appear on
   the calendar and agenda, tagged "Google". It refreshes each time you open the page.
- Two-way sync (creating events back into Google) is a later, bigger build (OAuth).

### Bank (Plaid) — not built yet
- Manual balances work today. Live balances need a Plaid account
  (<https://dashboard.plaid.com>) + `PLAID_CLIENT_ID`/`PLAID_SECRET` + a build.

### Phone push notifications — not built yet
- In-app/browser reminders work today. True push-to-phone needs web-push keys +
  a daily scheduler (a build).

## Recommended for tomorrow
1. Deploy (Option B if you can — it unlocks everything later).
2. Install on your phone.
3. (Optional) Add `OPENAI_API_KEY` for DEXA auto-read.
4. Use Calendar/Bank manually for now.
5. Ask me to build the Google Calendar **read-only import** next — it's the fastest
   real integration and I can have it working quickly once the repo is connected.
