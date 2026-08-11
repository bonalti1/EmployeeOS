-- ============================================================================
-- ASSISTANT WORKSPACE — shared tables for Rolando (owner) + Personal Assistant
-- ============================================================================
-- Run this once in Supabase → SQL Editor → New query → Run.
--
-- It is completely separate from your private `app_state` table: nothing here
-- touches your Personal OS data, and the RLS below means only people listed in
-- `workspace_members` can see any of it. Your private rows in `app_state`
-- remain readable ONLY by your own login (its existing policy), so the
-- assistant can never read your finances/health/family/journal — even with
-- the anon key and direct API calls.

-- ---------------------------------------------------------------------------
-- 1) Membership + roles
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_members (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text not null default '',
  role text not null check (role in ('owner', 'assistant')),
  created_at timestamptz not null default now()
);

alter table public.workspace_members enable row level security;

-- Role lookup used by every policy below. SECURITY DEFINER so it can read the
-- members table regardless of the caller's own RLS visibility.
create or replace function public.ws_role()
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.workspace_members where user_id = auth.uid()
$$;

-- Members can see the member list (so the app knows names/roles); only the
-- owner can add/remove/change members.
drop policy if exists "members can read members" on public.workspace_members;
create policy "members can read members" on public.workspace_members
  for select using (public.ws_role() is not null);

drop policy if exists "owner manages members" on public.workspace_members;
create policy "owner manages members" on public.workspace_members
  for all using (public.ws_role() = 'owner')
  with check (public.ws_role() = 'owner');

-- ---------------------------------------------------------------------------
-- 2) Shared tables
-- ---------------------------------------------------------------------------
create table if not exists public.ws_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  notes text not null default '',
  status text not null default 'inbox' check (status in ('inbox','today','upcoming','waiting','done')),
  category text not null default 'Personal' check (category in ('Personal','STB','ALTO','Content')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  due date,
  assigned_by text not null default 'assistant' check (assigned_by in ('owner','assistant')),
  waiting_on text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ws_content (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'STB' check (brand in ('STB','ALTO')),
  platform text not null default '',
  title text not null,
  idea text not null default '',
  hook text not null default '',
  script text not null default '',
  caption text not null default '',
  due date,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  raw_link text not null default '',
  final_link text not null default '',
  published_link text not null default '',
  notes text not null default '',
  stage text not null default 'ideas' check (stage in ('ideas','footage','ready','editing','review','approved','scheduled','published')),
  approval_status text not null default 'none' check (approval_status in ('none','pending','approved','changes')),
  approval_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Inbox from Rolando" — quick notes/requests between owner and assistant.
create table if not exists public.ws_messages (
  id uuid primary key default gen_random_uuid(),
  from_role text not null check (from_role in ('owner','assistant')),
  body text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ws_sops (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ws_media_links (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'STB' check (brand in ('STB','ALTO','General')),
  kind text not null default 'raw' check (kind in ('raw','finished','other')),
  label text not null,
  url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Editable workspace settings: brand voice, company context, daily
-- non-negotiables list, etc. Owner-writable (except a small allow-list the
-- assistant needs for day-to-day use), everyone in the workspace can read.
create table if not exists public.ws_settings (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3) Row Level Security — workspace members only
-- ---------------------------------------------------------------------------
alter table public.ws_tasks enable row level security;
alter table public.ws_content enable row level security;
alter table public.ws_messages enable row level security;
alter table public.ws_sops enable row level security;
alter table public.ws_media_links enable row level security;
alter table public.ws_settings enable row level security;

drop policy if exists "workspace members" on public.ws_tasks;
create policy "workspace members" on public.ws_tasks
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.ws_content;
create policy "workspace members" on public.ws_content
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.ws_messages;
create policy "workspace members" on public.ws_messages
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.ws_sops;
create policy "workspace members" on public.ws_sops
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.ws_media_links;
create policy "workspace members" on public.ws_media_links
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

-- Settings: everyone reads; owner writes anything; the assistant may only
-- write the daily-checklist state keys (nn_done_YYYY-MM-DD).
drop policy if exists "members read settings" on public.ws_settings;
create policy "members read settings" on public.ws_settings
  for select using (public.ws_role() is not null);

drop policy if exists "owner writes settings" on public.ws_settings;
create policy "owner writes settings" on public.ws_settings
  for all using (public.ws_role() = 'owner')
  with check (public.ws_role() = 'owner');

drop policy if exists "assistant checks off non-negotiables" on public.ws_settings;
create policy "assistant checks off non-negotiables" on public.ws_settings
  for insert to authenticated
  with check (public.ws_role() = 'assistant' and key like 'nn_done_%');

drop policy if exists "assistant updates non-negotiable checks" on public.ws_settings;
create policy "assistant updates non-negotiable checks" on public.ws_settings
  for update to authenticated
  using (public.ws_role() = 'assistant' and key like 'nn_done_%')
  with check (public.ws_role() = 'assistant' and key like 'nn_done_%');

-- ---------------------------------------------------------------------------
-- 4) Realtime — so the assistant sees approvals (and everything else) live
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ws_tasks','ws_content','ws_messages','ws_sops','ws_media_links','ws_settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Add YOURSELF as the owner
-- ---------------------------------------------------------------------------
-- You must already have signed in to the app at least once with this email.
insert into public.workspace_members (user_id, email, name, role)
select id, email, 'Rolando', 'owner'
from auth.users
where email = 'rolando@alto-realtygroup.com'
on conflict (user_id) do update set role = 'owner';

-- ---------------------------------------------------------------------------
-- 6) Add CARLOS (run AFTER he has created his account)
-- ---------------------------------------------------------------------------
-- 1. Have Carlos open the app and use "First time? Create your password"
--    with his email.
-- 2. Replace the email below with his and run just this statement:
--
-- insert into public.workspace_members (user_id, email, name, role)
-- select id, email, 'Carlos', 'assistant'
-- from auth.users
-- where email = 'carlos@example.com'
-- on conflict (user_id) do update set role = 'assistant';

-- ---------------------------------------------------------------------------
-- 7) Seed content — editable placeholders (safe to re-run; only fills blanks)
-- ---------------------------------------------------------------------------
insert into public.ws_settings (key, value)
values
  ('company_context', 'EDIT ME — Describe South Texas Builders (STB) and ALTO Pro here: what each company does, who the customers are, service areas, and anything the assistant''s AI tools should always know.'),
  ('brand_voice_stb', 'EDIT ME — Describe the South Texas Builders brand voice: tone, words to use/avoid, example phrases.'),
  ('brand_voice_alto', 'EDIT ME — Describe the ALTO Pro brand voice: tone, words to use/avoid, example phrases.'),
  ('nn_list', E'Check Inbox from Rolando\nReview today''s priorities\nPost/schedule today''s approved content\nUpdate content pipeline statuses\nEnd-of-day recap message')
on conflict (key) do nothing;

insert into public.ws_media_links (brand, kind, label, url, notes)
select * from (values
  ('STB',  'raw',      'STB — Raw footage folder',      '', 'Paste the Google Drive link to STB raw footage here.'),
  ('STB',  'finished', 'STB — Finished content folder', '', 'Paste the Google Drive link to STB finished content here.'),
  ('ALTO', 'raw',      'ALTO — Raw footage folder',     '', 'Paste the Google Drive link to ALTO raw footage here.'),
  ('ALTO', 'finished', 'ALTO — Finished content folder','', 'Paste the Google Drive link to ALTO finished content here.')
) as seed(brand, kind, label, url, notes)
where not exists (select 1 from public.ws_media_links);

insert into public.ws_sops (category, title, body, sort)
select * from (values
  ('Daily Operations', 'Daily Assistant Checklist',
   E'PLACEHOLDER — Rolando: edit this with the real routine.\n\n1. Check Inbox from Rolando.\n2. Review Today''s priorities.\n3. Work the content pipeline.\n4. End-of-day recap.', 1),
  ('STB Content', 'How We Create an STB Short-Form Video',
   E'PLACEHOLDER — Rolando: edit this with the real STB video process.\n\n1. Idea approved →\n2. Footage gathered →\n3. Edit →\n4. Review →\n5. Publish.', 2),
  ('ALTO Content', 'How We Create an ALTO Pro Short-Form Video',
   E'PLACEHOLDER — Rolando: edit this with the real ALTO Pro video process.\n\n1. Idea approved →\n2. Footage gathered →\n3. Edit →\n4. Review →\n5. Publish.', 3),
  ('Approvals', 'Content Approval Rules',
   E'PLACEHOLDER — Rolando: edit this with the real approval rules.\n\n• What needs approval before publishing?\n• Who approves and how fast?\n• What can be published without review?', 4),
  ('File Management', 'File Naming & Media Organization',
   E'PLACEHOLDER — Rolando: edit this with the real naming rules.\n\nSuggested format: BRAND_YYYY-MM-DD_topic_v1', 5),
  ('Publishing', 'Publishing Checklist',
   E'PLACEHOLDER — Rolando: edit this with the real publishing steps.\n\n• Caption finalized\n• Link added to Published\n• Cross-posted where needed', 6)
) as seed(category, title, body, sort)
where not exists (select 1 from public.ws_sops);
