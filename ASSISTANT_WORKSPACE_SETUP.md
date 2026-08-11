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

Reload the app: you'll now see **Assistant Workspace** in your sidebar under
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
select id, email, 'Assistant', 'assistant'
from auth.users
where email = 'assistant@example.com'
on conflict (user_id) do update set role = 'assistant';
```

4. The assistant refreshes the app — they now land **directly in the Assistant
   OS**: Home, Tasks, Content Pipeline, Media, SOPs, Approvals, AI Studio.
   None of your private pages exist in their app, and the database refuses
   them access to your private rows even via direct API calls.

To revoke access later:
`delete from public.workspace_members where email = 'assistant@example.com';`

## 4. AI Studio key

AI Studio reuses the same `OPENAI_API_KEY` Netlify environment variable as
your Journal AI (see `.env.example`). If it's already set, AI Studio works
immediately. The key stays server-side in the Netlify function
(`netlify/functions/assistant-ai.ts`) — never in the browser. The AI receives
only the shared brand context you edit in AI Studio, never your private
Personal OS data, and it has no live TikTok/Instagram trend access.

## 5. What's shared vs. private

| Shared (workspace tables, both of you) | Private (only you) |
| --- | --- |
| Workspace tasks, content pipeline, approvals | Finances, bank, payments |
| Inbox notes between you and the assistant | Health, family, journal |
| SOPs, media links, brand voice/context | Home tasks, calendar, companies |
| Daily non-negotiables + checklist state | Everything in Settings |
