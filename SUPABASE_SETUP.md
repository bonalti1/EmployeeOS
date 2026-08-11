# Cloud backup & sync — one-time setup (~10 minutes)

Your dashboard works offline on its own. Follow these steps once to also back
everything up to **your own** Supabase database and sync it across every device
you sign in on. Do this **first on the device that currently has your data**
(so it uploads), then sign in on your phone/other computers to pull it down.

---

## 1. Create a free Supabase project
1. Go to **https://supabase.com** → **Start your project** → sign up (free).
2. **New project.** Give it a name (e.g. `rjp-dashboard`), set a strong database
   password (save it somewhere safe), pick the region closest to you.
3. Wait ~2 minutes while it provisions.

## 2. Create the data table
1. In your project, left sidebar → **SQL Editor** → **New query**.
2. Paste everything below and click **Run**. It should say *Success*.

```sql
-- One key-value table holding all your dashboard data.
create table if not exists public.app_state (
  user_id uuid not null references auth.users on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Lock it down: each person can read/write only their own rows.
alter table public.app_state enable row level security;

create policy "app_state is private to its owner"
  on public.app_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Enable live cross-device sync for this table.
alter publication supabase_realtime add table public.app_state;
```

## 3. Get your two keys
1. Left sidebar → **Project Settings** (gear) → **API**.
2. Copy these two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long token under *Project API keys*
     (the `anon` / public one — **not** the `service_role` key)

> The anon key is safe to put in the app — it's meant to be public. Your login
> plus the security rule above are what actually protect your data.

## 4. Point the magic-link back to your site
1. Left sidebar → **Authentication** → **URL Configuration**.
2. Set **Site URL** to your Netlify address (e.g. `https://your-site.netlify.app`).
3. Add that same URL under **Redirect URLs** and save.

## 5. Add the keys to Netlify
1. In **Netlify** → your site → **Site configuration** → **Environment variables**.
2. Add two variables:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
3. **Redeploy:** Deploys → **Trigger deploy** → **Deploy site**.
   (Vite bakes these in at build time, so a redeploy is required.)

## 6. Sign in
1. Open your site. You'll now see a **Sign in** screen.
2. The first time, tap **First time? Create your password**, enter your email and
   a password, and tap **Create account & sign in**. After that, just enter your
   email + password and tap **Sign in** — instantly, no waiting for email.
   *(You can also tap **Email me a one-tap link instead** any time — that needs no
   password and no setup.)*
3. Your existing data uploads automatically. Repeat the sign-in on your phone
   and other computers — each one pulls everything down and stays in sync.

You can see the status and sign out any time under **Settings → Cloud backup**.

## 7. (Recommended) Make password sign-in instant

By default Supabase may require you to confirm your email the first time you
create a password. To skip that and have **Create account & sign in** log you
straight in:

1. Supabase → **Authentication** → **Sign In / Providers** → **Email**.
2. Turn **Confirm email** *off* → **Save**.

That's it — no keys, no external accounts. (If you leave it on, you'll just get
one confirmation email the very first time; password sign-in works normally
after that.)

---

## 8. (Optional) Sync journal voice recordings across devices

Text, titles, dates and summaries already sync. To also sync the **audio
recordings** themselves (so a note recorded on your phone plays back on your
computer), run this once in **SQL Editor → New query → Run**:

```sql
-- Private bucket for journal voice recordings
insert into storage.buckets (id, name, public)
values ('journal-audio', 'journal-audio', false)
on conflict (id) do nothing;

-- Each person can read/write only files inside their own user-id folder
create policy "own audio read"   on storage.objects for select to authenticated
  using (bucket_id = 'journal-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'journal-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own audio update" on storage.objects for update to authenticated
  using (bucket_id = 'journal-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own audio delete" on storage.objects for delete to authenticated
  using (bucket_id = 'journal-audio' and (storage.foldername(name))[1] = auth.uid()::text);
```

No Netlify change is needed — it uses the same keys. From then on, new
recordings upload automatically, and opening an entry on another device pulls
the audio down and caches it. (Recordings made before this was set up only
exist on the device they were made on.)

---

### Notes
- **What syncs:** all your tasks, non-negotiables, bills, bank, health numbers,
  DEXA values, family info, journal text & summaries, goals, settings, any
  photos/attachments saved in the app — and, once step 7 is done, journal
  voice recordings.
- **Free tier** is plenty for this — a personal dashboard uses a tiny fraction
  of the included database, storage and bandwidth.
