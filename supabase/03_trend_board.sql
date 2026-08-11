-- ============================================================================
-- TREND BOARD — add-on for the Assistant Workspace
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- Carlos researches TikTok/IG trends manually (TikTok Creative Center is free
-- and genuinely good) and logs what he finds here. AI Studio then drafts ideas
-- grounded in those logged findings — real research with a real date on it,
-- rather than the model inventing what it thinks is trending.
--
-- Every trend carries `observed_on` so both the UI and the AI can tell fresh
-- research from stale research. Trends rot fast; the date is the whole point.

create table if not exists public.ws_trends (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'topic' check (kind in ('sound','hashtag','format','topic','creator')),
  brand text not null default 'Both' check (brand in ('STB','ALTO','Both')),
  label text not null,
  url text not null default '',
  notes text not null default '',
  source text not null default 'TikTok Creative Center',
  observed_on date not null default current_date,
  status text not null default 'watching' check (status in ('watching','using','used','passed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ws_trends_observed_idx on public.ws_trends (observed_on desc);

alter table public.ws_trends enable row level security;

drop policy if exists "workspace members" on public.ws_trends;
create policy "workspace members" on public.ws_trends
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

do $$
begin
  begin
    alter publication supabase_realtime add table public.ws_trends;
  exception when duplicate_object then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Weekly research SOP
-- ---------------------------------------------------------------------------
-- Describes how to USE the tool (factual — Creative Center is a real, free
-- product). The judgment calls specific to STB/ALTO are left as placeholders
-- for Rolando to fill in.
insert into public.ws_sops (category, title, body, sort)
select 'Daily Operations', 'Weekly Trend Research',
E'Run this once a week (suggested: Monday morning). Takes about 15 minutes.\n\n'
'1. Open TikTok Creative Center — free, no account needed:\n'
'   https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en\n'
'   Set Region = United States, and use the Industry filter\n'
'   (Home Improvement / Real Estate are the closest matches).\n\n'
'2. Check these four tabs and note anything relevant:\n'
'   • Hashtags  — what topics are climbing\n'
'   • Songs     — sounds worth using while they are hot\n'
'   • Top Ads   — formats and hooks that are converting\n'
'   • Creators  — accounts in our space worth studying\n\n'
'3. Log each finding on the Trend Board (Workspace -> Trends).\n'
'   Add a note on WHY it applies to STB or ALTO — that note is what the\n'
'   AI uses when drafting ideas, so a vague note produces vague ideas.\n\n'
'4. Also scan Instagram Reels and YouTube Shorts for the same themes.\n'
'   A trend showing up on more than one platform is a stronger signal.\n\n'
'5. Move anything we act on to "Using", and mark it "Used" once published.\n'
'   Mark "Passed" on anything we deliberately skip, so we do not relog it.\n\n'
'RULES OF THUMB (PLACEHOLDER — Rolando: edit these):\n'
'• How fast must we act on a trending sound?\n'
'• Which trends are off-brand for us no matter how big they get?\n'
'• How many trend-based pieces per week vs. evergreen content?', 7
where not exists (select 1 from public.ws_sops where title = 'Weekly Trend Research');
