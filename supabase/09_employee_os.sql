-- ============================================================================
-- EMPLOYEE OS — one personal operating system per field employee, PIN login
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- Carlos signs in with an email account and lives inside the shared Content
-- workspace. Field employees (Roberto first) work differently: they type a
-- short PIN on their phone and land straight in their own OS. No email, no
-- password reset.
--
-- How the PIN stays safe without Supabase accounts:
--   * Employees never touch the emp_* tables directly. Row Level Security
--     lets only the owner (Rolando) read or write them.
--   * The employee's phone talks to the security-definer functions below.
--     emp_login(pin) checks the PIN here in the database and hands back a
--     random session token; every other emp_* call must present that token
--     and can only ever reach that one employee's rows.
--   * PINs are stored hashed, never in the page code, and repeated wrong
--     guesses from the same address are refused for 15 minutes.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.emp_employees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  title       text not null default '',
  company     text not null default 'STB',
  pin_hash    text unique,
  active      boolean not null default true,
  -- Buttons on the employee's home screen: [{ "label": "...", "url": "..." }]
  apps        jsonb not null default '[]'::jsonb,
  -- Rolando's standard for this employee (he can tick, not edit) …
  nn_owner    jsonb not null default '[]'::jsonb,
  -- … and the employee's own list (he edits it, Rolando reads it).
  nn_own      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.emp_sessions (
  token_hash  text primary key,
  employee_id uuid not null references public.emp_employees(id) on delete cascade,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);

create table if not exists public.emp_login_attempts (
  id  bigint generated always as identity primary key,
  ip  text not null default '',
  ok  boolean not null,
  at  timestamptz not null default now()
);
create index if not exists emp_login_attempts_ip_at on public.emp_login_attempts (ip, at);

create table if not exists public.emp_clock (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.emp_employees(id) on delete cascade,
  kind        text not null check (kind in ('in', 'out')),
  at          timestamptz not null default now(),
  lat         double precision,
  lng         double precision,
  accuracy_m  double precision,
  -- Why there is no location, when there isn't one ('denied', 'unavailable', …)
  geo_note    text not null default ''
);
create index if not exists emp_clock_emp_at on public.emp_clock (employee_id, at desc);

create table if not exists public.emp_tasks (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.emp_employees(id) on delete cascade,
  title       text not null,
  notes       text not null default '',
  due         date,
  done        boolean not null default false,
  done_at     timestamptz,
  created_by  text not null default 'owner' check (created_by in ('owner', 'employee')),
  created_at  timestamptz not null default now()
);
create index if not exists emp_tasks_emp on public.emp_tasks (employee_id, done, due);

-- One row per employee per day: today's non-negotiable ticks + journal entry.
create table if not exists public.emp_days (
  employee_id uuid not null references public.emp_employees(id) on delete cascade,
  day         date not null,
  nn_done     jsonb not null default '[]'::jsonb,
  journal     text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (employee_id, day)
);

-- ── Row Level Security: owner only ──────────────────────────────────────────

alter table public.emp_employees      enable row level security;
alter table public.emp_sessions       enable row level security;
alter table public.emp_login_attempts enable row level security;
alter table public.emp_clock          enable row level security;
alter table public.emp_tasks          enable row level security;
alter table public.emp_days           enable row level security;

do $$
declare t text;
begin
  foreach t in array array['emp_employees', 'emp_clock', 'emp_tasks', 'emp_days'] loop
    execute format('drop policy if exists "owner manages %1$s" on public.%1$I', t);
    execute format(
      'create policy "owner manages %1$s" on public.%1$I for all
         using (public.ws_role() = ''owner'') with check (public.ws_role() = ''owner'')', t);
  end loop;
end $$;
-- emp_sessions and emp_login_attempts get no policies at all: only the
-- functions below (security definer) ever read or write them.

-- Live updates on Rolando's Team page when Roberto clocks in or ticks a task.
do $$
declare t text;
begin
  foreach t in array array['emp_clock', 'emp_tasks', 'emp_days'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.emp_pin_hash(p_pin text)
returns text
language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest('stb-emp:' || lower(btrim(coalesce(p_pin, ''))), 'sha256'), 'hex')
$$;

create or replace function public.emp_client_ip()
returns text
language sql stable
as $$
  select coalesce(
    split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1),
    ''
  )
$$;

-- Resolves a session token to its employee, or raises. Every employee-facing
-- function starts with this, so a call can only ever reach its own rows.
create or replace function public.emp_session_employee(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp uuid;
  v_hash text := encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
begin
  select s.employee_id into v_emp
    from public.emp_sessions s
    join public.emp_employees e on e.id = s.employee_id
   where s.token_hash = v_hash and s.expires_at > now() and e.active;
  if v_emp is null then
    raise exception 'session_expired' using errcode = '28000';
  end if;
  update public.emp_sessions set last_seen = now() where token_hash = v_hash;
  return v_emp;
end $$;
revoke execute on function public.emp_session_employee(text) from public, anon, authenticated;

-- ── Employee-facing functions (called from the phone with the anon key) ─────

create or replace function public.emp_login(p_pin text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ip text := public.emp_client_ip();
  v_emp public.emp_employees;
  v_token text;
begin
  if (select count(*) from public.emp_login_attempts
       where ip = v_ip and not ok and at > now() - interval '15 minutes') >= 8 then
    raise exception 'too_many_attempts' using errcode = '28000';
  end if;

  select * into v_emp from public.emp_employees
   where pin_hash = public.emp_pin_hash(p_pin) and active;

  insert into public.emp_login_attempts (ip, ok) values (v_ip, v_emp.id is not null);
  delete from public.emp_login_attempts where at < now() - interval '1 day';

  -- A wrong PIN is returned, not raised: raising would roll back the attempt
  -- row just written, and the lockout above would never see the failures.
  if v_emp.id is null then
    return json_build_object('error', 'wrong_pin');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.emp_sessions (token_hash, employee_id)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_emp.id);
  delete from public.emp_sessions where expires_at < now();

  return json_build_object('token', v_token, 'name', v_emp.name);
end $$;

create or replace function public.emp_logout(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.emp_sessions
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- Everything the employee's OS needs for one day, in one round trip.
create or replace function public.emp_me(p_token text, p_day date)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp uuid := public.emp_session_employee(p_token);
begin
  return json_build_object(
    'employee', (select json_build_object(
        'id', e.id, 'name', e.name, 'title', e.title, 'company', e.company,
        'apps', e.apps, 'nn_owner', e.nn_owner, 'nn_own', e.nn_own)
      from public.emp_employees e where e.id = v_emp),
    'day', (select json_build_object('nn_done', d.nn_done, 'journal', d.journal)
      from public.emp_days d where d.employee_id = v_emp and d.day = p_day),
    'clock', coalesce((select json_agg(c order by c.at)
      from (select id, kind, at, lat, lng, accuracy_m, geo_note from public.emp_clock
             where employee_id = v_emp and at > now() - interval '36 hours') c), '[]'::json),
    'tasks', coalesce((select json_agg(t order by t.done, t.due nulls last, t.created_at)
      from (select id, title, notes, due, done, done_at, created_by, created_at from public.emp_tasks
             where employee_id = v_emp
               and (not done or done_at > now() - interval '7 days')) t), '[]'::json)
  );
end $$;

create or replace function public.emp_clock_punch(
  p_token text, p_kind text, p_lat double precision, p_lng double precision,
  p_accuracy double precision, p_geo_note text)
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_emp uuid := public.emp_session_employee(p_token);
  v_row public.emp_clock;
begin
  if p_kind not in ('in', 'out') then raise exception 'bad_kind'; end if;
  insert into public.emp_clock (employee_id, kind, lat, lng, accuracy_m, geo_note)
  values (v_emp, p_kind, p_lat, p_lng, p_accuracy, left(coalesce(p_geo_note, ''), 80))
  returning * into v_row;
  return json_build_object('id', v_row.id, 'kind', v_row.kind, 'at', v_row.at,
    'lat', v_row.lat, 'lng', v_row.lng, 'accuracy_m', v_row.accuracy_m, 'geo_note', v_row.geo_note);
end $$;

create or replace function public.emp_task_done(p_token text, p_task uuid, p_done boolean)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_emp uuid := public.emp_session_employee(p_token);
begin
  update public.emp_tasks
     set done = p_done, done_at = case when p_done then now() else null end
   where id = p_task and employee_id = v_emp;
end $$;

create or replace function public.emp_task_add(p_token text, p_title text, p_due date)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_emp uuid := public.emp_session_employee(p_token);
begin
  if btrim(coalesce(p_title, '')) = '' then return; end if;
  insert into public.emp_tasks (employee_id, title, due, created_by)
  values (v_emp, left(btrim(p_title), 300), p_due, 'employee');
end $$;

-- The employee may delete only tasks he created himself; Rolando's stay.
create or replace function public.emp_task_delete(p_token text, p_task uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_emp uuid := public.emp_session_employee(p_token);
begin
  delete from public.emp_tasks
   where id = p_task and employee_id = v_emp and created_by = 'employee';
end $$;

create or replace function public.emp_day_save(p_token text, p_day date, p_nn_done jsonb, p_journal text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_emp uuid := public.emp_session_employee(p_token);
begin
  insert into public.emp_days (employee_id, day, nn_done, journal, updated_at)
  values (v_emp, p_day, coalesce(p_nn_done, '[]'::jsonb), left(coalesce(p_journal, ''), 20000), now())
  on conflict (employee_id, day) do update
    set nn_done = coalesce(p_nn_done, public.emp_days.nn_done),
        journal = coalesce(left(p_journal, 20000), public.emp_days.journal),
        updated_at = now();
end $$;

-- The employee's OWN non-negotiables. Rolando's list (nn_owner) is not
-- reachable from here, so the standard can't be edited by the person it
-- applies to.
create or replace function public.emp_nn_own_save(p_token text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_emp uuid := public.emp_session_employee(p_token);
begin
  update public.emp_employees set nn_own = coalesce(p_items, '[]'::jsonb) where id = v_emp;
end $$;

-- ── Owner-only: set or change an employee's PIN ─────────────────────────────

create or replace function public.emp_set_pin(p_employee uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.ws_role() is distinct from 'owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_pin, ''))) < 4 then
    raise exception 'pin_too_short';
  end if;
  if exists (select 1 from public.emp_employees
              where pin_hash = public.emp_pin_hash(p_pin) and id <> p_employee) then
    raise exception 'pin_taken';
  end if;
  update public.emp_employees set pin_hash = public.emp_pin_hash(p_pin) where id = p_employee;
  -- A new PIN signs the employee out everywhere.
  delete from public.emp_sessions where employee_id = p_employee;
end $$;

-- ── Seed: Roberto ───────────────────────────────────────────────────────────
-- His Employee OS PIN is set from the Team page (Rolando → Team → Roberto →
-- PIN), so it never sits in this file.
--
-- The button opens the scheduling board in VIEW-ONLY mode: the board reads
-- `#code=` once, signs him in as its 'viewer' role and wipes the code from
-- the address bar. That code is the board's own viewer password (defined in
-- the board's public index.html, USERS) — not his Employee OS PIN.

insert into public.emp_employees (name, title, company, apps)
select 'Roberto', 'Field', 'STB',
       '[{"label": "Open STB Scheduling", "url": "https://stb-scheduling.netlify.app/#code=916303"}]'::jsonb
where not exists (select 1 from public.emp_employees where name = 'Roberto');
