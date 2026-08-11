# Rolando's Dashboard

A personal life dashboard — tasks, bills, calendar, a voice journal and more,
all in one calm, customizable place. Built with **React + TypeScript +
Vite + Tailwind CSS v4**. No backend required for the core experience; all data
is stored privately in the browser.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into /dist
npm run preview  # preview the production build
```

## What's inside

| Page | What it does | Status |
| --- | --- | --- |
| **Home** | Today screen: greeting, quick-add, **daily non-negotiables** (reset each day), today's agenda, bills, what's coming up. | ✅ Working |
| **Tasks** | The "Alastair Method" — a master checklist plus a brain-dump list. Promote dumped ideas into real tasks. | ✅ Working |
| **Work list** | Weekly planner split into **Home tasks** and **Work tasks**, one column per day. | ✅ Working |
| **Payments** | The Excel replacement: bills down the side, Jan→Dec across the top, set amounts, click a cell to mark paid, live monthly/yearly totals + income. | ✅ Working |
| **Bank** | Track account balances by hand now; designed to drop in Plaid for live balances. | ✅ Working (manual) |
| **Calendar** | Month view with local events. | ✅ Working |
| **Health** | Weight log with trend line + records (doctor visits, labs, prescriptions) with file attachments. | ✅ Working |
| **Family** | Members & birthdays, upcoming-birthday reminders, appointments, medicine. | ✅ Working |
| **Journal** | Record your voice → live transcription + short summary, saved by day so you can look back. Audio in IndexedDB, text in localStorage. | ✅ Working |
| **Notifications** | Upcoming events/appointments/birthdays in the next 30 days + browser alerts. | ✅ Working |
| **Settings** | Recolor the whole dashboard (presets + custom colors), connect integrations, export/import a backup of all data. | ✅ Working |

## Architecture

- **`src/lib/store.ts`** — `useStore` hook persists every feature's state to
  `localStorage` (prefixed `jess:`), synced across tabs. This is the source of
  truth for the offline-first experience.
- **`src/lib/theme.tsx`** — theme provider that writes CSS variables to
  `:root`, so the entire UI recolors instantly from Settings.
- **`src/components/`** — `Sidebar`, shared `ui` primitives, icon set.
- **`src/pages/`** — one file per dashboard section.

## Deploy to Netlify

The app is configured to deploy to Netlify with serverless functions (see
`netlify.toml`).

1. Push this branch to GitHub (done).
2. In Netlify: **Add new site → Import from GitHub** and pick this repo.
   Build command and publish dir are auto-detected from `netlify.toml`
   (`npm run build` → `dist`).
3. (Optional) Add environment variables under **Site settings → Environment
   variables** as you connect services — see **Settings → Integrations** in the
   app for the full list (`OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `PLAID_*`, …).
4. Deploy. The site is also an installable **PWA** — open it on a phone and
   choose "Add to Home Screen" to use it like a native app.

### Local development

```bash
npm run dev                 # UI only — everything works offline
npm i -g netlify-cli        # one-time
netlify dev                 # runs the app + the serverless functions together
```

## The Journal

- Record your voice in the **Journal** page. Audio is captured with
  `MediaRecorder` and stored privately in **IndexedDB** (`src/lib/audioStore.ts`).
- Live transcription uses the browser's built-in Web Speech API (best in
  Chrome/Edge). You can also just type. A short summary is generated from the
  transcript, and entries are grouped by day so you can look back.
- Cloud transcription (Whisper) and AI summaries can be layered on later through
  the existing `netlify/functions/ask.ts` + `OPENAI_API_KEY` — the key is never
  exposed to the browser.

## Roadmap — connected services

These are built with clean integration points so they drop in when ready:

1. **Google Calendar** — two-way sync via Google's API / OAuth.
2. **Bank (Plaid)** — live balances and "deposited last month". Add a Plaid
   account + a `netlify/functions/plaid-*` function.
3. **Journal AI (OpenAI)** — cloud transcription + AI summaries via the `ask`
   function. Add `OPENAI_API_KEY`.
4. **Apple Health / Garmin** — import weight, activity and labs into the Health
   page (HealthKit export or Garmin Connect API).
5. **Phone push notifications** — web push / email reminders + a daily
   scheduler, feeding off the existing Notifications list.

## Privacy

All data lives in the browser's `localStorage` on the device. Nothing is sent
anywhere until a connected service is explicitly added. Use **Settings →
Export backup** to save a copy.
