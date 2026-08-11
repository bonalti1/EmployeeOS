-- ============================================================================
-- IDEA BOARD — add-on for the Assistant Workspace
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- A shared scratchpad for raw ideas from either Rolando or Carlos. Everything
-- except the text itself is optional and set AFTER capture — the whole point
-- is that logging an idea takes seconds, so ideas actually get logged.
--
-- Ideas graduate: `promoted_to` records where an idea went once it became a
-- real content item or task, so the board shows a track record of ideas that
-- shipped rather than just a graveyard.

create table if not exists public.ws_ideas (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  note text not null default '',
  category text not null default 'Unsorted'
    check (category in ('Unsorted','Content','Marketing','Business','Process')),
  brand text not null default 'Both' check (brand in ('STB','ALTO','Both','Internal')),
  status text not null default 'new' check (status in ('new','exploring','doing','shipped','parked')),
  starred boolean not null default false,
  has_audio boolean not null default false,
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  promoted_to text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ws_ideas_created_idx on public.ws_ideas (created_at desc);

alter table public.ws_ideas enable row level security;

drop policy if exists "workspace members" on public.ws_ideas;
create policy "workspace members" on public.ws_ideas
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

do $$
begin
  begin
    alter publication supabase_realtime add table public.ws_ideas;
  exception when duplicate_object then null;
  end;
end $$;

-- Voice notes attached to ideas reuse the shared workspace-audio bucket from
-- 02_daily_journal.sql (under an `ideas/` folder). If you skipped that file,
-- run it first or voice capture will have nowhere to upload.
