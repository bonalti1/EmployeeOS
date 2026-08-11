-- ============================================================================
-- MARKETING STUDIO — company-scoped marketing intelligence system
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- THE RULE THAT SHAPES THIS SCHEMA: company data must never mix. Every row
-- carries company_id, every query is scoped server-side, and generation
-- context is fetched from the database by company_id — never assembled in
-- the browser. STB and ALTO are different rooms.
--
-- workspace_id exists for a future multi-workspace world; today there is
-- exactly one workspace, so it defaults to a fixed id and nothing joins on it.

-- ---------------------------------------------------------------------------
-- 1) Companies
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  slug text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.mkt_companies (name, slug)
values ('South Texas Builders', 'stb'), ('ALTO Pro', 'alto')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Brand DNA — one profile per company, eight jsonb sections
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_brand_profiles (
  company_id uuid primary key references public.mkt_companies on delete cascade,
  identity jsonb not null default '{}',
  customer jsonb not null default '{}',
  positioning jsonb not null default '{}',
  voice jsonb not null default '{}',
  proof jsonb not null default '{}',
  offers jsonb not null default '{}',
  safety_claims jsonb not null default '{}',
  visual_brand jsonb not null default '{}',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.mkt_brand_profiles (company_id)
select id from public.mkt_companies
on conflict (company_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Marketing ideas
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  company_id uuid not null references public.mkt_companies on delete cascade,
  title text not null default '',
  raw_idea text not null,
  objective text not null default '',
  audience text not null default '',
  product text not null default '',
  offer text not null default '',
  source_url text not null default '',
  notes text not null default '',
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  status text not null default 'idea'
    check (status in ('idea','developing','ready','approved','published','archived')),
  tags text[] not null default '{}',
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mkt_ideas_company_idx on public.mkt_ideas (company_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) Marketing lenses — principle frameworks, seeded below, owner-editable
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_lenses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  principles jsonb not null default '[]',
  questions jsonb not null default '[]',
  best_for jsonb not null default '[]',
  limitations jsonb not null default '[]',
  prompt_instructions text not null default '',
  active boolean not null default true,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- 5) Campaigns + immutable versions
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  company_id uuid not null references public.mkt_companies on delete cascade,
  idea_id uuid references public.mkt_ideas on delete set null,
  title text not null default '',
  objective text not null default '',
  audience text not null default '',
  funnel_stage text not null default '',
  channels text[] not null default '{}',
  video_length text not null default '',
  tone text not null default '',
  cta_preference text not null default '',
  selected_lens text not null default '',
  council_lenses jsonb,
  current_version_id uuid,
  status text not null default 'draft'
    check (status in ('draft','generated','approved','published','archived')),
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mkt_campaigns_company_idx on public.mkt_campaigns (company_id, created_at desc);

-- Versions are append-only: a new generation or a human edit creates a new
-- row; nothing overwrites an old version.
create table if not exists public.mkt_campaign_versions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.mkt_campaigns on delete cascade,
  company_id uuid not null references public.mkt_companies on delete cascade,
  version_number int not null,
  generation_mode text not null default 'single' check (generation_mode in ('single','council','manual_edit')),
  marketing_lens text not null default '',
  structured_output jsonb not null default '{}',
  edited_output jsonb,
  council_analyses jsonb,
  approved boolean not null default false,
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (campaign_id, version_number)
);

create index if not exists mkt_versions_campaign_idx on public.mkt_campaign_versions (campaign_id, version_number desc);

-- ---------------------------------------------------------------------------
-- 6) Creative assets + generation jobs
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  company_id uuid not null references public.mkt_companies on delete cascade,
  campaign_id uuid references public.mkt_campaigns on delete cascade,
  campaign_version_id uuid references public.mkt_campaign_versions on delete set null,
  type text not null check (type in ('image','video','thumbnail','reference')),
  url text not null default '',
  storage_path text not null default '',
  provider text not null default '',
  model text not null default '',
  approved boolean not null default false,
  metadata jsonb not null default '{}',
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists mkt_assets_company_idx on public.mkt_assets (company_id, created_at desc);

create table if not exists public.mkt_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default '00000000-0000-0000-0000-000000000001',
  company_id uuid not null references public.mkt_companies on delete cascade,
  idea_id uuid references public.mkt_ideas on delete set null,
  campaign_id uuid references public.mkt_campaigns on delete set null,
  generation_type text not null check (generation_type in ('text','image','video')),
  provider text not null default '',
  model text not null default '',
  status text not null default 'draft'
    check (status in ('draft','awaiting_confirmation','queued','processing','completed','failed','cancelled')),
  request_payload jsonb not null default '{}',
  result_payload jsonb,
  external_job_id text,
  estimated_cost numeric,
  actual_cost numeric,
  currency text,
  error text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  author_role text not null default 'assistant' check (author_role in ('owner','assistant')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mkt_jobs_company_idx on public.mkt_generation_jobs (company_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- 7) Performance — schema only (RJP Intelligence feeds on this later)
-- ---------------------------------------------------------------------------
create table if not exists public.mkt_performance (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.mkt_companies on delete cascade,
  campaign_id uuid references public.mkt_campaigns on delete cascade,
  platform text not null default '',
  publish_date date,
  metrics jsonb not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mkt_perf_company_idx on public.mkt_performance (company_id, publish_date desc);

-- ---------------------------------------------------------------------------
-- 8) Paid-media permission flag (owner-only video confirmation by default)
-- ---------------------------------------------------------------------------
alter table public.workspace_members
  add column if not exists can_generate_paid_media boolean not null default false;

update public.workspace_members set can_generate_paid_media = true where role = 'owner';

-- ---------------------------------------------------------------------------
-- 9) RLS — members only; Brand DNA / lenses / companies writable by owner
-- ---------------------------------------------------------------------------
alter table public.mkt_companies enable row level security;
alter table public.mkt_brand_profiles enable row level security;
alter table public.mkt_ideas enable row level security;
alter table public.mkt_lenses enable row level security;
alter table public.mkt_campaigns enable row level security;
alter table public.mkt_campaign_versions enable row level security;
alter table public.mkt_assets enable row level security;
alter table public.mkt_generation_jobs enable row level security;
alter table public.mkt_performance enable row level security;

drop policy if exists "members read" on public.mkt_companies;
create policy "members read" on public.mkt_companies
  for select using (public.ws_role() is not null);
drop policy if exists "owner writes" on public.mkt_companies;
create policy "owner writes" on public.mkt_companies
  for all using (public.ws_role() = 'owner') with check (public.ws_role() = 'owner');

drop policy if exists "members read" on public.mkt_brand_profiles;
create policy "members read" on public.mkt_brand_profiles
  for select using (public.ws_role() is not null);
drop policy if exists "owner writes" on public.mkt_brand_profiles;
create policy "owner writes" on public.mkt_brand_profiles
  for all using (public.ws_role() = 'owner') with check (public.ws_role() = 'owner');

drop policy if exists "members read" on public.mkt_lenses;
create policy "members read" on public.mkt_lenses
  for select using (public.ws_role() is not null);
drop policy if exists "owner writes" on public.mkt_lenses;
create policy "owner writes" on public.mkt_lenses
  for all using (public.ws_role() = 'owner') with check (public.ws_role() = 'owner');

drop policy if exists "workspace members" on public.mkt_ideas;
create policy "workspace members" on public.mkt_ideas
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.mkt_campaigns;
create policy "workspace members" on public.mkt_campaigns
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.mkt_campaign_versions;
create policy "workspace members" on public.mkt_campaign_versions
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.mkt_assets;
create policy "workspace members" on public.mkt_assets
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.mkt_generation_jobs;
create policy "workspace members" on public.mkt_generation_jobs
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

drop policy if exists "workspace members" on public.mkt_performance;
create policy "workspace members" on public.mkt_performance
  for all using (public.ws_role() is not null) with check (public.ws_role() is not null);

-- ---------------------------------------------------------------------------
-- 10) Realtime
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mkt_companies','mkt_ideas','mkt_campaigns','mkt_campaign_versions','mkt_assets','mkt_generation_jobs'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 11) Storage bucket for generated creatives
-- ---------------------------------------------------------------------------
-- Public READ so generated images render with plain <img> tags (marketing
-- creatives are made to be published); writes restricted to members.
insert into storage.buckets (id, name, public)
values ('marketing-assets', 'marketing-assets', true)
on conflict (id) do nothing;

drop policy if exists "mkt assets insert" on storage.objects;
create policy "mkt assets insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'marketing-assets' and public.ws_role() is not null);

drop policy if exists "mkt assets update" on storage.objects;
create policy "mkt assets update" on storage.objects for update to authenticated
  using (bucket_id = 'marketing-assets' and public.ws_role() is not null)
  with check (bucket_id = 'marketing-assets' and public.ws_role() is not null);

drop policy if exists "mkt assets delete" on storage.objects;
create policy "mkt assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'marketing-assets' and public.ws_role() is not null);

-- ---------------------------------------------------------------------------
-- 12) Seed the 11 marketing lenses
-- ---------------------------------------------------------------------------
-- These are frameworks of publicly documented marketing principles associated
-- with each thinker — NOT impersonations, and nothing generated with them may
-- claim any person's endorsement. Prompt instructions are written accordingly.
insert into public.mkt_lenses (slug, name, description, principles, questions, best_for, limitations, prompt_instructions, sort)
values
(
  'ogilvy', 'David Ogilvy', 'Research-driven brand advertising built on product truth, credibility and headlines that do the selling.',
  '["Research the product and customer before writing","The headline is 80% of the ad","Give the facts — informative selling beats cleverness","Build long-term brand image with every ad","Respect the customer''s intelligence","Premium presentation signals premium product"]',
  '["What is the product truth we can lead with?","What does the research say customers actually care about?","What headline would make the ideal customer stop?","Does this build the brand we want in 5 years?"]',
  '["trust","brand advertising","educational ads","established businesses"]',
  '["Can feel formal for raw social-native formats","Needs real product facts to work — thin input gives thin output"]',
  'Apply research-driven brand advertising principles: lead with product truth and specific facts, invest most effort in the headline/hook, sell through useful information rather than hype, and keep the presentation premium and credible. Long-term brand perception outranks short-term cleverness.',
  1
),
(
  'hopkins', 'Claude Hopkins', 'Scientific advertising: reason-why copy, specificity, proof, concrete offers, and measurable response.',
  '["Give a specific reason why","Specifics outperform generalities — exact numbers beat round claims","Every claim needs proof","Make a concrete offer with a clear next step","Advertising exists to sell, and results must be measurable","Test everything"]',
  '["What is the specific reason-why behind this claim?","What number or fact makes this concrete?","What is the measurable response we want?","What offer makes acting now logical?"]',
  '["performance marketing","testing","concrete offers"]',
  '["Less suited to pure brand-feel content","Demands real proof — will surface Proof needed flags often"]',
  'Apply scientific-advertising principles: every claim gets a specific reason-why, generalities are replaced with exact specifics, offers are concrete with one clear next step, and the piece is built to produce a measurable response. Flag any claim lacking proof as "Proof needed" rather than asserting it.',
  2
),
(
  'schwartz', 'Eugene Schwartz', 'Channel existing desire by matching the message to the market''s awareness and sophistication level.',
  '["Copy cannot create desire — only channel existing desire onto the product","Diagnose the prospect''s awareness stage first","Match the headline to the awareness stage","As markets sophisticate, claims must escalate to mechanisms and identification","The intensity of the promise must fit what the market already believes"]',
  '["What does this audience already desire?","What awareness stage is this ad targeting?","Has this market heard these claims before — what is the next sophistication move?","What existing belief can this message ride?"]',
  '["messaging","hooks","landing pages","funnel-stage ads"]',
  '["Abstract without a clear audience definition","Wrong awareness diagnosis produces mismatched copy"]',
  'Apply market-awareness principles: identify the existing desire in the audience and channel it toward the product rather than inventing new desire. Diagnose the awareness stage (unaware → most aware) and match the hook and structure to it. Consider market sophistication: if the claim has been heard before, escalate to mechanism or identity rather than volume.',
  3
),
(
  'halbert', 'Gary Halbert', 'Attention-first conversational direct response: curiosity, emotional hooks, and offers people feel.',
  '["The first job is attention — nothing works if nobody stops","Write person-to-person, like a letter to one reader","Curiosity and self-interest open the door","The market (starving crowd) matters more than the copy","A strong offer beats strong prose","Momentum: every line exists to get the next line read"]',
  '["What would make this audience physically stop scrolling?","What is the emotional center of this message?","Is there a starving-crowd angle here?","Does every line pull to the next?"]',
  '["scroll-stopping copy","direct response","sales messages"]',
  '["Can drift toward hype if unchecked by proof","Conversational tone may clash with premium positioning"]',
  'Apply attention-first direct-response principles: open with a pattern-breaking, curiosity-or-self-interest hook, write conversationally to one person, keep momentum line to line, and anchor everything in a strong concrete offer. High energy, but never fabricate urgency or proof.',
  4
),
(
  'ries', 'Al Ries', 'Positioning: own one word or idea in the customer''s mind, focus narrowly, and differentiate against the alternatives.',
  '["Positioning happens in the prospect''s mind, not in the product","Own one word or idea — focus beats breadth","Better to be first in a category than better in an existing one","Define against the competition the customer already knows","Line extension dilutes; sacrifice strengthens"]',
  '["What single word or idea should this company own?","What category are we really in — and could we name a new one?","What does the customer currently slot us next to?","What should we deliberately NOT claim?"]',
  '["brand strategy","competitive positioning","category creation"]',
  '["Strategic rather than tactical — pairs best with an execution lens","Narrow focus can feel limiting for multi-service companies"]',
  'Apply positioning principles: identify the one word or idea the company should own in the customer''s mind, position explicitly against the alternatives customers already know, prefer category creation or narrowing over broad claims, and recommend what to sacrifice. Keep every message consistent with that single position.',
  5
),
(
  'cialdini', 'Robert Cialdini', 'Ethical influence: authority, social proof, reciprocity, consistency, liking, scarcity and unity — honestly applied.',
  '["People follow credible authority — show credentials honestly","Social proof: similar others'' behavior guides decisions","Reciprocity: give genuine value first","Commitment and consistency: small yeses precede big ones","Scarcity only when genuinely true","Unity: shared identity with the audience"]',
  '["What honest authority signals do we have?","What real social proof exists — and from customers like the viewer?","What can we give before we ask?","What genuine scarcity or deadline applies, if any?"]',
  '["proof","trust","conversion psychology"]',
  '["Principles amplify a message — they don''t replace one","Misuse reads as manipulation and damages the brand; scarcity must be real"]',
  'Apply ethical-influence principles: surface honest authority markers, real social proof from similar customers, reciprocity (lead with genuine value), consistency (small commitments first), and genuine scarcity only if it truly exists. Never fabricate proof, reviews, urgency or popularity; if proof is missing, mark it "Proof needed".',
  6
),
(
  'kotler', 'Philip Kotler', 'Classical strategy: segment, target, position; align the 4 Ps; message flows from a clear value proposition.',
  '["Segment the market and choose targets deliberately","Position with a clear value proposition for the chosen segment","Align product, price, place and promotion","Marketing starts with customer needs, not the product","Measure against explicit marketing objectives"]',
  '["Which segment exactly is this for?","What is the value proposition in one sentence?","Is the message aligned with price point and delivery?","What objective does this campaign serve and how is it measured?"]',
  '["full campaign strategy","market selection","product/market-fit messaging"]',
  '["Framework-heavy — output can feel academic without a creative lens on top","Less about the hook, more about the plan"]',
  'Apply classical marketing-strategy principles: name the specific segment being targeted, state the value proposition in one sentence, check message consistency with the rest of the mix (price, delivery, channel), and tie the campaign to an explicit measurable objective. Strategy first, then creative flows from it.',
  7
),
(
  'godin', 'Seth Godin', 'Remarkable, story-driven marketing for the smallest viable audience — permission and trust over interruption.',
  '["Be remarkable — worth making a remark about","Serve the smallest viable audience deeply","Permission: earn attention, don''t steal it","Tell a story people want to tell themselves","People like us do things like this","Consistency and generosity build trust"]',
  '["What makes this genuinely remarkable?","Who exactly is the smallest viable audience?","What story does the customer tell themselves?","Would anyone share this — and why?"]',
  '["organic content","brand stories","community","memorable ideas"]',
  '["Less direct-response oriented — conversions arrive slower","Remarkability is a high bar; forced quirk backfires"]',
  'Apply remarkability-and-trust principles: aim the idea at the smallest viable audience and make it genuinely worth remarking on, frame it as a story the customer tells about themselves ("people like us do things like this"), favor generosity and earned attention over interruption, and optimize for being shared and remembered over immediate hard sell.',
  8
),
(
  'sharp', 'Byron Sharp', 'Evidence-based brand growth: broad reach, mental and physical availability, and distinctive brand assets used consistently.',
  '["Brands grow by reaching all category buyers, not by loyalty tricks","Mental availability: be easy to think of in buying situations","Physical availability: be easy to find and buy","Distinctive assets (colors, marks, sounds) must be used relentlessly","Consistency beats constant reinvention","Light buyers matter most and are reached broadly"]',
  '["Which buying situations should this brand come to mind in?","Are our distinctive assets present and unmistakable?","Does this reach beyond our existing fans?","Is this consistent with everything else we run?"]',
  '["brand growth","reach strategy","consistency","distinctive assets"]',
  '["Less useful for direct-response one-offs","Assumes distinctive assets exist — young brands must first define them"]',
  'Apply evidence-based brand-growth principles: optimize for broad reach across all category buyers, tie the message to specific buying situations (mental availability), make the next step easy (physical availability), and feature the brand''s distinctive assets prominently and consistently. Flag anything that fragments brand consistency.',
  9
),
(
  'abraham', 'Jay Abraham', 'Leverage and preeminence: maximize existing assets, partnerships and lifetime value; be the most trusted advisor in the market.',
  '["Three ways to grow: more clients, bigger transactions, more frequent transactions","Preeminence: act as the client''s most trusted advisor","Leverage under-used assets — lists, partners, past clients","Risk reversal removes the barrier to yes","Look for the overlooked opportunity everyone else misses"]',
  '["Which of the three growth levers does this pull?","What existing asset (list, partner, past clients) can this leverage?","What risk can we remove for the customer?","What would the most trusted advisor in this market say here?"]',
  '["business growth","offers","partnerships","monetization"]',
  '["Business-strategy heavy — needs a creative lens for the actual ad","Partnership ideas need real-world follow-through"]',
  'Apply leverage-and-preeminence principles: position the company as the customer''s most trusted advisor (educate and advise rather than pitch), identify which growth lever the campaign pulls (new clients, larger transactions, repeat frequency), propose risk reversal where honest, and look for leverage in existing assets — past customers, partners, referrals.',
  10
),
(
  'hormozi', 'Alex Hormozi', 'Offers so good people feel stupid saying no: maximize the value equation and prove it with direct, concrete content.',
  '["Value = (dream outcome × perceived likelihood) ÷ (time delay × effort and sacrifice)","Raise likelihood with proof; cut delay and effort visibly","Make the offer the hero — stack value, add honest guarantees and urgency","Lead with the outcome, fast and concrete","Give away the secrets, sell the implementation","Volume and consistency compound"]',
  '["What is the dream outcome in the customer''s words?","What proof raises their belief it will work for them?","How do we visibly cut time delay and effort?","What would make this offer feel stupid to refuse — honestly?"]',
  '["lead generation","offers","acquisition","short-form direct-response content"]',
  '["Aggressive offer framing can clash with premium/understated brands","Value stacking without real proof collapses — proof is load-bearing"]',
  'Apply value-equation principles: articulate the dream outcome concretely, raise perceived likelihood with real proof (or mark "Proof needed"), show how time delay and effort are reduced, and make the offer itself the hero of the piece — stacked, specific, with honest guarantees or urgency only where true. Direct, outcome-first language; give value in the content itself.',
  11
)
on conflict (slug) do nothing;
