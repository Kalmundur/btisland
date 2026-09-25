-- ============================================================================
-- Borðtennis Live – core schema
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.encounter_status as enum (
  'scheduled',            -- not started
  'lineups',              -- both lineups submitted and revealed
  'in_progress',          -- scoring has started
  'awaiting_confirmation',-- one side has confirmed the result
  'completed',            -- both sides confirmed / organizer finalized: official
  'cancelled'
);

create type public.team_side as enum ('home', 'away');
create type public.set_state_status as enum ('pending', 'agreed', 'conflict');

-- Generic updated_at trigger ---------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Organizers (admin users, email/password auth) ---------------------------------
create table public.organizers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- League structure -------------------------------------------------------------
create table public.clubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  short_name text not null unique check (length(trim(short_name)) > 0),
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.seasons (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  starts_on  date,
  ends_on    date,
  is_current boolean not null default false,
  created_at timestamptz not null default now()
);
-- At most one current season.
create unique index seasons_single_current on public.seasons (is_current) where is_current;

create table public.divisions (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (season_id, name),
  unique (id, season_id) -- target for composite FKs that guarantee season/division consistency
);

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete restrict,
  name       text not null unique,
  is_public  boolean not null default true,
  created_at timestamptz not null default now()
);
create index teams_club_idx on public.teams (club_id);

-- Which teams take part in a division (a division belongs to a season).
create table public.division_teams (
  division_id uuid not null references public.divisions (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  primary key (division_id, team_id)
);

create table public.players (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs (id) on delete restrict,
  full_name  text not null check (length(trim(full_name)) > 0),
  is_public  boolean not null default true,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create index players_club_idx on public.players (club_id);
create index players_name_idx on public.players (lower(full_name));

create table public.team_registrations (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players (id) on delete cascade,
  team_id     uuid not null references public.teams (id) on delete cascade,
  season_id   uuid not null references public.seasons (id) on delete cascade,
  division_id uuid not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  foreign key (division_id, season_id) references public.divisions (id, season_id) on delete cascade,
  -- A player represents one team per division per season.
  unique (player_id, season_id, division_id)
);
create index team_registrations_team_idx on public.team_registrations (team_id, season_id);

-- Schedule ------------------------------------------------------------------------
create table public.rounds (
  id          uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.divisions (id) on delete cascade,
  number      integer not null check (number > 0),
  round_date  date not null,
  start_time  time,          -- nullable: often unknown when the schedule is published
  venue       text,
  created_at  timestamptz not null default now(),
  unique (division_id, number)
);

-- One six-digit code per season+division+round (round implies both).
-- NEVER readable by the public – see RLS and join_round().
create table public.round_access_codes (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.rounds (id) on delete cascade,
  code           text not null check (code ~ '^[0-9]{6}$'),
  is_active      boolean not null default true,
  is_dev_seed    boolean not null default false,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  deactivated_at timestamptz
);
create unique index round_access_codes_one_active_per_round on public.round_access_codes (round_id) where is_active;
create unique index round_access_codes_active_code_unique on public.round_access_codes (code) where is_active;

create table public.encounters (
  id                  uuid primary key default gen_random_uuid(),
  round_id            uuid not null references public.rounds (id) on delete cascade,
  home_team_id        uuid not null references public.teams (id) on delete restrict, -- A/B/C
  away_team_id        uuid not null references public.teams (id) on delete restrict, -- X/Y/Z
  status              public.encounter_status not null default 'scheduled',
  home_score          smallint check (home_score >= 0),
  away_score          smallint check (away_score >= 0),
  lineups_revealed_at timestamptz,
  doubles_revealed_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (home_team_id <> away_team_id)
);
create index encounters_round_idx on public.encounters (round_id);
create index encounters_home_idx on public.encounters (home_team_id);
create index encounters_away_idx on public.encounters (away_team_id);
create trigger encounters_touch before update on public.encounters
  for each row execute function public.touch_updated_at();

-- Player identity (anonymous auth user/device -> official player) ---------------
create table public.player_device_profiles (
  auth_user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger player_device_profiles_touch before update on public.player_device_profiles
  for each row execute function public.touch_updated_at();

-- Access granted by join_round(). Survives code regeneration (no hard dependency on the code).
create table public.round_sessions (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid not null references auth.users (id) on delete cascade,
  round_id       uuid not null references public.rounds (id) on delete cascade,
  encounter_id   uuid not null references public.encounters (id) on delete cascade,
  team_id        uuid not null references public.teams (id) on delete cascade,
  player_id      uuid not null references public.players (id) on delete cascade,
  access_code_id uuid references public.round_access_codes (id) on delete set null,
  joined_at      timestamptz not null default now(),
  unique (auth_user_id, round_id)
);
create index round_sessions_encounter_idx on public.round_sessions (encounter_id);

-- Brute-force protection for join_round(). No policies: only the RPC touches it.
create table public.join_attempts (
  id           bigint generated always as identity primary key,
  auth_user_id uuid not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_idx on public.join_attempts (auth_user_id, attempted_at);

-- Lineups -------------------------------------------------------------------------
create table public.lineups (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  side         public.team_side not null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (encounter_id, side)
);

create table public.lineup_slots (
  id        uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  slot      char(1) not null check (slot in ('A', 'B', 'C', 'X', 'Y', 'Z')),
  player_id uuid not null references public.players (id) on delete restrict,
  unique (lineup_id, slot),
  unique (lineup_id, player_id)
);

create table public.lineup_confirmations (
  id           uuid primary key default gen_random_uuid(),
  lineup_id    uuid not null references public.lineups (id) on delete cascade,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  side         public.team_side not null,
  created_at   timestamptz not null default now(),
  unique (lineup_id, auth_user_id)
);

-- Doubles ---------------------------------------------------------------------------
create table public.doubles_selections (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  team_id      uuid not null references public.teams (id) on delete cascade,
  side         public.team_side not null,
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (encounter_id, side)
);

create table public.doubles_players (
  id                   uuid primary key default gen_random_uuid(),
  doubles_selection_id uuid not null references public.doubles_selections (id) on delete cascade,
  player_id            uuid not null references public.players (id) on delete restrict,
  position             smallint not null check (position in (1, 2)),
  unique (doubles_selection_id, position),
  unique (doubles_selection_id, player_id)
);

create table public.doubles_confirmations (
  id                   uuid primary key default gen_random_uuid(),
  doubles_selection_id uuid not null references public.doubles_selections (id) on delete cascade,
  auth_user_id         uuid not null references auth.users (id) on delete cascade,
  player_id            uuid not null references public.players (id) on delete cascade,
  side                 public.team_side not null,
  created_at           timestamptz not null default now(),
  unique (doubles_selection_id, auth_user_id)
);

-- Scoring ---------------------------------------------------------------------------
-- Games (individual matches) inside an encounter. Filled by the scoring engine (next phase).
create table public.encounter_games (
  id              uuid primary key default gen_random_uuid(),
  encounter_id    uuid not null references public.encounters (id) on delete cascade,
  game_number     smallint not null check (game_number between 1 and 20),
  kind            text not null check (kind in ('singles', 'doubles')),
  home_slot       text,
  away_slot       text,
  home_player1_id uuid references public.players (id) on delete set null,
  home_player2_id uuid references public.players (id) on delete set null,
  away_player1_id uuid references public.players (id) on delete set null,
  away_player2_id uuid references public.players (id) on delete set null,
  home_sets       smallint not null default 0,
  away_sets       smallint not null default 0,
  winner          public.team_side,
  unique (encounter_id, game_number)
);

-- Raw per-side score entry. Private: each side only sees its own entries.
create table public.set_entries (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  game_number  smallint not null check (game_number between 1 and 20),
  set_number   smallint not null check (set_number between 1 and 7),
  side         public.team_side not null,
  home_points  smallint not null check (home_points between 0 and 99),
  away_points  smallint not null check (away_points between 0 and 99),
  entered_by   uuid references auth.users (id) on delete set null,
  player_id    uuid references public.players (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (encounter_id, game_number, set_number, side)
);
create trigger set_entries_touch before update on public.set_entries
  for each row execute function public.touch_updated_at();

-- Public, reconciled view of each set. Points are only filled when both sides agree.
create table public.reconciled_set_states (
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  game_number  smallint not null,
  set_number   smallint not null,
  status       public.set_state_status not null default 'pending',
  home_points  smallint,
  away_points  smallint,
  updated_at   timestamptz not null default now(),
  primary key (encounter_id, game_number, set_number)
);

create table public.result_confirmations (
  id           uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  side         public.team_side not null,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  player_id    uuid not null references public.players (id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (encounter_id, auth_user_id)
);

-- Audit -----------------------------------------------------------------------------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  actor_user_id uuid,
  action        text not null,
  entity_table  text not null,
  entity_id     uuid,
  details       jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity_table, entity_id);

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    nullif(v_row ->> 'id', '')::uuid,
    case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)) else v_row end
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clubs', 'teams', 'players', 'seasons', 'divisions', 'team_registrations', 'rounds',
    'round_access_codes', 'encounters', 'lineups', 'doubles_selections', 'set_entries',
    'result_confirmations'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;
