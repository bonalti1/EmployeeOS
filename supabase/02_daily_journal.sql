-- ============================================================================
-- DAILY JOURNAL — add-on for the Assistant Workspace
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses the ws_role()
-- helper and the workspace_members table created there).
--
-- Adds Carlos's daily accountability journal: two entries a day (a work recap
-- and a personal-growth reflection), each optionally recorded by voice.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1) The journal table
-- ---------------------------------------------------------------------------
create table if not exists public.ws_journal (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  kind text not null check (kind in ('recap', 'growth')),
  text text not null default '',
  has_audio boolean not null default false,
  duration_ms int not null default 0,
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ws_journal_date_idx on public.ws_journal (entry_date desc);

alter table public.ws_journal enable row level security;

drop policy if exists "workspace members" on public.ws_journal;
create policy "workspace members" on public.ws_journal
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

-- Live updates so a recap recorded on his phone shows on your screen at once.
do $$
begin
  begin
    alter publication supabase_realtime add table public.ws_journal;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Shared audio bucket for the voice recordings
-- ---------------------------------------------------------------------------
-- Private bucket (not public) — only workspace members can read or write it.
-- This is SEPARATE from your private `journal-audio` bucket, which stays
-- locked to your own user folder and is not touched here.
insert into storage.buckets (id, name, public)
values ('workspace-audio', 'workspace-audio', false)
on conflict (id) do nothing;

drop policy if exists "ws audio read"   on storage.objects;
drop policy if exists "ws audio insert" on storage.objects;
drop policy if exists "ws audio update" on storage.objects;
drop policy if exists "ws audio delete" on storage.objects;

create policy "ws audio read" on storage.objects for select to authenticated
  using (bucket_id = 'workspace-audio' and public.ws_role() is not null);

create policy "ws audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace-audio' and public.ws_role() is not null);

create policy "ws audio update" on storage.objects for update to authenticated
  using (bucket_id = 'workspace-audio' and public.ws_role() is not null)
  with check (bucket_id = 'workspace-audio' and public.ws_role() is not null);

create policy "ws audio delete" on storage.objects for delete to authenticated
  using (bucket_id = 'workspace-audio' and public.ws_role() is not null);

-- ---------------------------------------------------------------------------
-- 3) Add the journal to the daily non-negotiables (optional)
-- ---------------------------------------------------------------------------
-- Skipped on purpose — you said you'd rather add your non-negotiables by hand.
-- The Journal page tracks its own streak and shows a status card on Home, so
-- it holds him accountable whether or not it appears in that list.
--
-- If you DO want it in the list later, edit it in-app (Home → Daily
-- non-negotiables → Edit list) and add lines like:
--   Record today's recap in the Journal
--   Record what I did today to get better
