-- ============================================================================
-- VIDEO PLANNER — add-on for the Assistant Workspace
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- Three content pipelines share one table, split by `board`:
--
--   youtube      the flagship: one long-form video a week, planned ahead —
--                episode number, category pillar (Lifestyle / Business /
--                Construction), working title, description, a candidate
--                thumbnail, and the final link once it's live. Each episode
--                carries its three short-form clips (idea + Shorts link +
--                Reels link each) in `clips`, because the clips have no life
--                of their own — they exist to feed the episode.
--   stb_tiktok   STB's short-form pipeline: same card, lighter — no episode
--                numbers, no clips-of-clips, no weekly quota.
--   personal     Marca Personal — Carlos's own pipeline, same light shape.
--
-- Rows live on a week (`week_start`, the Monday) rather than a date because
-- the planning question is "what's going out in week 41?", not "what's going
-- out on Tuesday?". Candidate thumbnails reuse the shared workspace-audio
-- bucket (02_daily_journal.sql) under a `thumbs/` folder — run that file
-- first if you skipped it, or thumbnail upload will have nowhere to go.

create table if not exists public.ws_videos (
  id uuid primary key default gen_random_uuid(),
  board text not null check (board in ('youtube','stb_tiktok','personal')),
  week_start date not null,
  episode int,
  category text not null default ''
    check (category in ('','Lifestyle','Business','Construction')),
  title text not null default '',
  description text not null default '',
  link text not null default '',
  thumb_path text not null default '',
  status text not null default 'planned'
    check (status in ('planned','in_progress','ready','published')),
  clips jsonb not null default '[]',
  author_role text not null default 'owner' check (author_role in ('owner','assistant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ws_videos_week_idx on public.ws_videos (board, week_start desc);

alter table public.ws_videos enable row level security;

drop policy if exists "workspace members" on public.ws_videos;
create policy "workspace members" on public.ws_videos
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

-- The status set grew after first ship (planned / in_progress / ready /
-- published). Re-running this file migrates an existing table in place.
alter table public.ws_videos drop constraint if exists ws_videos_status_check;
update public.ws_videos set status = 'planned' where status = 'planning';
alter table public.ws_videos
  add constraint ws_videos_status_check
  check (status in ('planned','in_progress','ready','published'));
alter table public.ws_videos alter column status set default 'planned';

do $$
begin
  begin
    alter publication supabase_realtime add table public.ws_videos;
  exception when duplicate_object then null;
  end;
end $$;
