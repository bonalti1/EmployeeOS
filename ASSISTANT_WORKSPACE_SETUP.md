# Assistant Workspace — one-time setup

The Assistant Workspace is a shared area for you (owner) and your Personal
Assistant / Content Creator. It lives in **its own Supabase tables** with Row
Level Security — completely separate from your private Personal OS data
(`app_state`), which only your own login can ever read.

Your Personal OS is unchanged: same pages, same data, same sync.

---

## 1. Prerequisite

You must already have Supabase connected (see `SUPABASE_SETUP.md`) and have
signed in to the app at least once with **your** email
(`rolando@alto-realtygroup.com`).

## 2. Run the workspace SQL (once)

1. Supabase → **SQL Editor** → **New query**.
2. Paste the entire contents of **`supabase/assistant_workspace.sql`** (in this
   project) and click **Run**.

That single script:
- creates the shared tables (`workspace_members`, `ws_tasks`, `ws_content`,
  `ws_messages`, `ws_sops`, `ws_media_links`, `ws_settings`),
- locks them all down so **only workspace members** can read or write them,
- enables realtime (the assistant sees your approvals instantly),
- registers **your** account as `owner`,
- seeds placeholder SOPs, the four media folders, brand-voice fields, and a
  starter daily non-negotiables list — all editable in the app.

Then run **`supabase/02_daily_journal.sql`** the same way. It adds Carlos's
daily accountability journal (two voice-recordable prompts a day) plus the
shared `workspace-audio` bucket his recordings are stored in. Your private
`journal-audio` bucket is untouched.

Then run **`supabase/03_trend_board.sql`**. It adds the Trend Board — where
Carlos logs weekly platform research that AI Studio then drafts from — and
seeds the "Weekly Trend Research" SOP.

Finally run **`supabase/04_idea_board.sql`** for the shared Idea Board (the
floating **+** capture button and its voice notes). Run file 02 first if you
haven't — idea voice notes share that file's `workspace-audio` bucket.

Reload the app: you'll now see **Carlos's Workspace** in your sidebar under
"Team".

## 3. Create the assistant's account

1. Send your assistant the app URL.
2. They tap **"First time? Create your password"** on the sign-in screen and
   create an account with their email.
   - At this point they can sign in but see only an *empty personal dashboard* —
     they are **not** in the workspace yet and can see none of your data.
3. In Supabase → **SQL Editor**, run (replace the email):

```sql
insert into public.workspace_members (user_id, email, name, role)
select id, email, 'Carlos', 'assistant'
from auth.users
where email = 'carlos@example.com'
on conflict (user_id) do update set role = 'assistant';
```

4. The assistant refreshes the app — they now land **directly in the Assistant
   OS**: Home, Tasks, Content Pipeline, Media, SOPs, Approvals, AI Studio.
   None of your private pages exist in their app, and the database refuses
   them access to your private rows even via direct API calls.

To revoke access later:
`delete from public.workspace_members where email = 'carlos@example.com';`

### Renaming the workspace later

The employee's OS is branded by name ("Carlos Operating System"), not by job
title. If the seat ever changes hands or you want different branding, edit the
`ASSISTANT_NAME` constant at the top of `src/lib/workspace.tsx` — every label
across both apps updates from that one line.

## 4. AI Studio key

AI Studio reuses the same `OPENAI_API_KEY` Netlify environment variable as
your Journal AI (see `.env.example`). If it's already set, AI Studio works
immediately. The key stays server-side in the Netlify function
(`netlify/functions/assistant-ai.ts`) — never in the browser. The AI receives
only the shared brand context you edit in AI Studio plus the trends Carlos
logs on the Trend Board — never your private Personal OS data.

**On trends:** there is no live TikTok/Instagram feed wired in, because no
official trends API is available to a business (TikTok's Research API is
limited to academics and nonprofits) and scraper services break constantly.
Instead Carlos does a 15-minute weekly pass through TikTok's free Creative
Center and logs what he finds, each entry dated. AI Studio drafts from that
research and ignores anything older than 21 days. If you later want to
automate the collection, only the ingestion changes — the board and the AI
wiring stay as they are.

## 5. What's shared vs. private

| Shared (workspace tables, both of you) | Private (only you) |
| --- | --- |
| Workspace tasks, content pipeline, approvals | Finances, bank, payments |
| Inbox notes between you and the assistant | Health, family, journal |
| SOPs, media links, brand voice/context | Home tasks, calendar, companies |
| Daily non-negotiables + checklist state | Everything in Settings |
