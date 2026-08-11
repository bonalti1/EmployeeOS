# Setup — Rolando's Dashboard

Offline-first personal dashboard. **Vite + React + TypeScript + Tailwind v4**,
data stored locally in the browser (`localStorage`), installable as a PWA,
deployable to Netlify with serverless functions.

## 1. Run it locally

```bash
npm install        # one-time
npm run dev        # http://localhost:5173
```

The app works fully offline for the core experience — no keys or backend
needed. AI/link-preview features degrade gracefully to local search until the
Netlify functions are connected (see below).

```bash
npm run build      # production build → /dist
npm run preview    # preview the production build
```

## 2. Deploy (two ways)

**A — Drag-and-drop (fastest, static only):**
Drop the contents of `/dist` onto <https://app.netlify.com/drop>. Ships the full
app + PWA. The voice **Journal** works fully in a drop deploy (recording +
transcription are all in-browser). The serverless functions (link unfurl,
optional AI) aren't included in a drop deploy — the app still runs without them.

**B — Connect the repo (recommended, functions included):**
1. Netlify → **Add new site → Import from GitHub** → pick this repo.
   Build command / publish dir auto-detect from `netlify.toml` (`npm run build` → `dist`).
2. Add environment variables under **Site settings → Environment variables**
   only as you connect a service (all optional — see **Settings → Integrations**
   in the app for the live checklist):
   - `GOOGLE_CLIENT_ID` — Google Calendar sync
   - `PLAID_CLIENT_ID` / `PLAID_SECRET` — live bank balances
   - `OPENAI_API_KEY` — optional cloud transcription + AI summaries for the Journal
   - `VAPID_PUBLIC_KEY` — phone push notifications
3. Deploy. Open on a phone → **Add to Home Screen** to install the PWA.

## 3. Make it yours (no code needed)

- **Name** → Settings → Profile → Name (drives the greeting + sidebar signature).
- **Colors** → Settings → Color themes / Custom colors. To change the default,
  edit `PRESETS` in `src/lib/theme.tsx`.
- **Back up your data** → Settings → Export backup (JSON).

## 4. Add / remove a page (3 spots)

1. `src/components/Sidebar.tsx` — add/remove the entry in the `MENU`/`PREFS` arrays.
2. `src/App.tsx` — add/remove its `<Route>`.
3. `src/pages/<Name>.tsx` — the page file itself.

Shared building blocks live in `src/lib/` (store, theme, toast, dates, format,
agenda, ai) and `src/components/ui.tsx` + `icons.tsx` — keep these; they power
every page.
