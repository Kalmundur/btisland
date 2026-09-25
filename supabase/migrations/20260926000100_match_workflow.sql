-- ============================================================================
-- Borðtennis Live – phase 2: league-match workflow
--
--  * official 10-match format (match_format)
--  * versioned, two-person-confirmed hidden lineups and doubles
--  * per-scorer game entries (set_entries) with idempotent client ids
--  * server-side reconciliation (trigger) -> reconciled_set_states
--  * fully derived encounter state (recompute_encounter): match statuses,
--    team score, phases, early finish, draw, result hash
--  * result confirmation bound to a result hash + organizer tools
--
-- Terminology change vs. phase 1:
--   match_number = individual match 1–10 (was game_number)
--   game_number  = "lota" 1–5 inside a match (was set_number)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Official match format (reference data)
-- ---------------------------------------------------------------------------
create table public.match_format (
  match_number smallint primary key check (match_number between 1 and 10),
  kind         text not null check (kind in ('singles', 'doubles')),
  home_slot    char(1),
  away_slot    char(1),
  phase        smallint not null check (phase between 1 and 3)
);

insert into public.match_format (match_number, kind, home_slot, away_slot, phase) values
  (1, 'singles', 'A', 'Y', 1),
  (2, 'singles', 'B', 'Z', 1),
  (3, 'singles', 'C', 'X', 1),
  (4, 'singles', 'A', 'Z', 1),
  (5, 'singles', 'B', 'X', 1),
  (6, 'singles', 'C', 'Y', 1),
  (7, 'doubles', null, null, 2),
  (8, 'singles', 'A', 'X', 3),
  (9, 'singles', 'B', 'Y', 3),
  (10, 'singles', 'C', 'Z', 3);

alter table public.match_format enable row level security;
create policy match_format_public_read on public.match_format for select using (true);

-- ---------------------------------------------------------------------------
-- 2. Lineups & doubles: versions + two-person confirmation
-- ---------------------------------------------------------------------------
alter table public.lineups
  add column version integer not null default 1,
  add column confirmed_count smallint not null default 0,
  add column locked_at timestamptz;

alter table public.lineup_confirmations
  add column version integer not null default 1;
alter table public.lineup_confirmations
  drop constraint if exists lineup_confirmations_lineup_id_auth_user_id_key;
-- The same player can never count twice for the same version.
alter table public.lineup_confirmations
  add constraint lineup_confirmations_one_per_player unique (lineup_id, version, player_id);

alter table public.doubles_selections
  add column version integer not null default 1,
  add column confirmed_count smallint not null default 0,
  add column locked_at timestamptz;

alter table public.doubles_confirmations
  add column version integer not null default 1;
alter table public.doubles_confirmations
  drop constraint if exists doubles_confirmations_doubles_selection_id_auth_user_id_key;
alter table public.doubles_confirmations
  add constraint doubles_confirmations_one_per_player unique (doubles_selection_id, version, player_id);

-- ---------------------------------------------------------------------------
-- 3. Per-scorer entries
-- ---------------------------------------------------------------------------
alter table public.set_entries
  drop constraint if exists set_entries_encounter_id_game_number_set_number_side_key;
alter table public.set_entries rename column game_number to match_number;
alter table public.set_entries rename column set_number to game_number;
alter table public.set_entries rename column entered_by to auth_user_id;
alter table public.set_entries rename column player_id to submitted_by_player_id;
alter table public.set_entries add column client_entry_id uuid;
update public.set_entries set client_entry_id = gen_random_uuid() where client_entry_id is null;
alter table public.set_entries alter column client_entry_id set not null;
alter table public.set_entries
  add constraint set_entries_match_range check (match_number between 1 and 10),
  add constraint set_entries_game_range check (game_number between 1 and 5),
  add constraint set_entries_client_entry_unique unique (client_entry_id),
  -- one editable entry per scorer (player) per game
  add constraint set_entries_one_per_scorer unique (encounter_id, match_number, game_number, submitted_by_player_id);
comment on column public.set_entries.side is 'Team side of the scorer (informational).';

-- Reconciled (canonical) state per game ----------------------------------------
alter table public.reconciled_set_states rename column game_number to match_number;
alter table public.reconciled_set_states rename column set_number to game_number;
alter table public.reconciled_set_states
  add column submitter_count smallint not null default 0;
comment on table public.reconciled_set_states is
  'Server-maintained. agreed = every submission identical (points set); conflict = submissions differ (points null). No majority voting.';

-- Derived per-match state ----------------------------------------------------------
alter table public.encounter_games rename column game_number to match_number;
alter table public.encounter_games rename column home_sets to home_games;
alter table public.encounter_games rename column away_sets to away_games;
alter table public.encounter_games
  add column phase smallint not null default 1,
  add column status text not null default 'locked'
    check (status in ('locked', 'available', 'in_progress', 'conflict', 'completed', 'not_played'));
comment on column public.encounter_games.winner is 'Only set for counted (completed) matches – unplayed matches never contribute stats.';

-- Encounter result versioning -----------------------------------------------------
alter table public.encounters
  add column result_hash text,
  add column result_version integer not null default 0,
  add column final_report jsonb;

alter table public.result_confirmations
  drop constraint if exists result_confirmations_encounter_id_auth_user_id_key;
alter table public.result_confirmations
  add column result_hash text,
  add column result_version integer,
  add column snapshot jsonb,
  add column invalidated_at timestamptz;

-- Audit the slot tables too (lineup history is otherwise overwritten).
create trigger lineup_slots_audit after insert or update or delete on public.lineup_slots
  for each row execute function public.audit_row_change();
create trigger doubles_players_audit after insert or update or delete on public.doubles_players
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. Replace phase-1 player RPCs
-- ---------------------------------------------------------------------------
drop function if exists public.submit_lineup(uuid, jsonb);
drop function if exists public.confirm_lineup(uuid);
drop function if exists public.submit_doubles(uuid, uuid, uuid);
drop function if exists public.confirm_doubles(uuid);
drop function if exists public.submit_set_entry(uuid, integer, integer, integer, integer);
drop function if exists public.confirm_result(uuid);

-- Official game rule: 11 with loser <= 9, or >= 12 with a two-point margin. Never a tie.
create or replace function public.is_valid_set_score(p_a integer, p_b integer)
returns boolean language sql immutable as $$
  select p_a is not null and p_b is not null and p_a >= 0 and p_b >= 0 and (
    (greatest(p_a, p_b) = 11 and least(p_a, p_b) <= 9)
    or (greatest(p_a, p_b) >= 12 and least(p_a, p_b) = greatest(p_a, p_b) - 2)
  );
$$;

create or replace function public.session_player_id(p_encounter_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select rs.player_id from public.round_sessions rs
  where rs.auth_user_id = auth.uid() and rs.encounter_id = p_encounter_id
  limit 1;
$$;

create or replace function public.lock_encounter(p_encounter_id uuid)
returns void language sql volatile as $$
  -- Serialises every write that affects one encounter's derived state.
  select pg_advisory_xact_lock(hashtextextended('encounter:' || p_encounter_id::text, 0));
$$;

-- ---------------------------------------------------------------------------
-- 5. Reconciliation of one game (called from the set_entries trigger)
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_game(p_encounter_id uuid, p_match integer, p_game integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count    integer;
  v_distinct integer;
  v_home     integer;
  v_away     integer;
begin
  select count(*), count(distinct (home_points, away_points)), min(home_points), min(away_points)
    into v_count, v_distinct, v_home, v_away
  from public.set_entries
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;

  if v_count = 0 then
    delete from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;
    return;
  end if;

  insert into public.reconciled_set_states
    (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, updated_at)
  values (
    p_encounter_id, p_match, p_game,
    case when v_distinct = 1 then 'agreed'::public.set_state_status else 'conflict'::public.set_state_status end,
    case when v_distinct = 1 then v_home end,
    case when v_distinct = 1 then v_away end,
    v_count, now()
  )
  on conflict (encounter_id, match_number, game_number) do update
    set status = excluded.status,
        home_points = excluded.home_points,
        away_points = excluded.away_points,
        submitter_count = excluded.submitter_count,
        updated_at = now()
  where (reconciled_set_states.status, reconciled_set_states.home_points,
         reconciled_set_states.away_points, reconciled_set_states.submitter_count)
        is distinct from
        (excluded.status, excluded.home_points, excluded.away_points, excluded.submitter_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Printable/snapshot report of an encounter
-- ---------------------------------------------------------------------------
create or replace function public.encounter_report(p_encounter_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'encounter_id', e.id,
    'home_team', ht.name,
    'away_team', at.name,
    'home_score', e.home_score,
    'away_score', e.away_score,
    'result_hash', e.result_hash,
    'result_version', e.result_version,
    'matches', (
      select jsonb_agg(jsonb_build_object(
        'match', eg.match_number,
        'kind', eg.kind,
        'home_slot', eg.home_slot,
        'away_slot', eg.away_slot,
        'status', eg.status,
        'winner', eg.winner,
        'home_games', eg.home_games,
        'away_games', eg.away_games,
        'home_players', (
          select coalesce(jsonb_agg(p.full_name order by u.ord), '[]'::jsonb)
          from unnest(array[eg.home_player1_id, eg.home_player2_id]) with ordinality u(pid, ord)
          join public.players p on p.id = u.pid),
        'away_players', (
          select coalesce(jsonb_agg(p.full_name order by u.ord), '[]'::jsonb)
          from unnest(array[eg.away_player1_id, eg.away_player2_id]) with ordinality u(pid, ord)
          join public.players p on p.id = u.pid),
        'games', (
          select coalesce(jsonb_agg(jsonb_build_array(r.home_points, r.away_points) order by r.game_number), '[]'::jsonb)
          from public.reconciled_set_states r
          where r.encounter_id = eg.encounter_id and r.match_number = eg.match_number
            and eg.status = 'completed' and r.game_number <= eg.home_games + eg.away_games)
      ) order by eg.match_number)
      from public.encounter_games eg where eg.encounter_id = e.id)
  )
  from public.encounters e
  join public.teams ht on ht.id = e.home_team_id
  join public.teams at on at.id = e.away_team_id
  where e.id = p_encounter_id;
$$;

-- ---------------------------------------------------------------------------
-- 7. Derived encounter state – the single authority for match statuses,
--    team score, phase unlocking, early finish, draw and result hash.
--    Always recomputed from reconciled game rows; never +1/-1 counters.
-- ---------------------------------------------------------------------------
create or replace function public.recompute_encounter(p_encounter_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e            public.encounters;
  f            record;
  g            record;
  v_hg         integer;
  v_ag         integer;
  v_conflict   boolean;
  v_started    boolean;
  v_winner     public.team_side[] := array_fill(null::public.team_side, array[10]);
  v_state      text[] := array_fill('none'::text, array[10]);
  v_home_games integer[] := array_fill(0, array[10]);
  v_away_games integer[] := array_fill(0, array[10]);
  v_unlocked   boolean[] := array_fill(false, array[10]);
  v_counted    boolean[] := array_fill(false, array[10]);
  v_revealed   boolean;
  v_doubles    boolean;
  v_phase1     boolean := true;
  v_home       integer := 0;
  v_away       integer := 0;
  v_decided    boolean;
  v_finished   boolean;
  v_all        boolean := true;
  v_status     text;
  v_hash       text;
  v_home_ok    boolean;
  v_away_ok    boolean;
  v_any        boolean;
  v_new_status public.encounter_status;
  v_slots_home jsonb := '{}'::jsonb;
  v_slots_away jsonb := '{}'::jsonb;
  v_dh         uuid[];
  v_da         uuid[];
  i            integer;
begin
  perform public.lock_encounter(p_encounter_id);
  select * into e from public.encounters where id = p_encounter_id;
  if not found then
    return;
  end if;
  v_revealed := e.lineups_revealed_at is not null;
  v_doubles := e.doubles_revealed_at is not null;

  -- a) each match on its own: games won, winner, conflict, started ---------------
  for f in select * from public.match_format order by match_number loop
    v_hg := 0;
    v_ag := 0;
    v_conflict := false;
    v_started := false;
    for g in
      select * from public.reconciled_set_states
      where encounter_id = p_encounter_id and match_number = f.match_number
      order by game_number
    loop
      v_started := true;
      exit when v_hg = 3 or v_ag = 3;               -- games after the deciding one never count
      exit when g.game_number <> v_hg + v_ag + 1;   -- gap: wait for the missing game
      if g.status = 'conflict' then
        v_conflict := true;
        exit;
      end if;
      if g.home_points > g.away_points then v_hg := v_hg + 1; else v_ag := v_ag + 1; end if;
    end loop;
    v_home_games[f.match_number] := v_hg;
    v_away_games[f.match_number] := v_ag;
    if v_hg = 3 then
      v_winner[f.match_number] := 'home';
    elsif v_ag = 3 then
      v_winner[f.match_number] := 'away';
    end if;
    v_state[f.match_number] := case
      when v_winner[f.match_number] is not null then 'done'
      when v_conflict then 'conflict'
      when v_started then 'progress'
      else 'none' end;
  end loop;

  -- b) phase unlocking and counting ------------------------------------------------
  for i in 1..6 loop
    v_unlocked[i] := v_revealed;
    v_counted[i] := v_revealed and v_winner[i] is not null;
    v_phase1 := v_phase1 and v_counted[i];
  end loop;
  v_unlocked[7] := v_phase1 and v_doubles;
  v_counted[7] := v_unlocked[7] and v_winner[7] is not null;
  for i in 8..10 loop
    v_unlocked[i] := v_counted[7];
    v_counted[i] := v_counted[7] and v_winner[i] is not null;
  end loop;

  for i in 1..10 loop
    if v_counted[i] then
      if v_winner[i] = 'home' then v_home := v_home + 1; else v_away := v_away + 1; end if;
    else
      v_all := false;
    end if;
  end loop;
  v_decided := v_home >= 6 or v_away >= 6;
  v_finished := v_decided or v_all;

  -- c) players (only once revealed) --------------------------------------------------
  if v_revealed then
    select coalesce(jsonb_object_agg(s.slot, s.player_id), '{}'::jsonb) into v_slots_home
    from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
    where l.encounter_id = p_encounter_id and l.side = 'home';
    select coalesce(jsonb_object_agg(s.slot, s.player_id), '{}'::jsonb) into v_slots_away
    from public.lineup_slots s join public.lineups l on l.id = s.lineup_id
    where l.encounter_id = p_encounter_id and l.side = 'away';
  end if;
  if v_doubles then
    select array_agg(dp.player_id order by dp.position) into v_dh
    from public.doubles_players dp join public.doubles_selections d on d.id = dp.doubles_selection_id
    where d.encounter_id = p_encounter_id and d.side = 'home';
    select array_agg(dp.player_id order by dp.position) into v_da
    from public.doubles_players dp join public.doubles_selections d on d.id = dp.doubles_selection_id
    where d.encounter_id = p_encounter_id and d.side = 'away';
  end if;

  -- d) per-match derived rows ----------------------------------------------------------
  for f in select * from public.match_format order by match_number loop
    i := f.match_number;
    v_status := case
      when v_counted[i] then 'completed'
      when v_decided then 'not_played'
      when not v_unlocked[i] then 'locked'
      when v_state[i] = 'conflict' then 'conflict'
      when v_state[i] in ('progress', 'done') then 'in_progress'
      else 'available' end;

    insert into public.encounter_games as eg (
      encounter_id, match_number, kind, home_slot, away_slot, phase,
      home_player1_id, home_player2_id, away_player1_id, away_player2_id,
      home_games, away_games, winner, status)
    values (
      p_encounter_id, i, f.kind, f.home_slot, f.away_slot, f.phase,
      case when f.kind = 'singles' then (v_slots_home ->> f.home_slot)::uuid else v_dh[1] end,
      case when f.kind = 'doubles' then v_dh[2] end,
      case when f.kind = 'singles' then (v_slots_away ->> f.away_slot)::uuid else v_da[1] end,
      case when f.kind = 'doubles' then v_da[2] end,
      v_home_games[i], v_away_games[i],
      case when v_counted[i] then v_winner[i] end,
      v_status)
    on conflict (encounter_id, match_number) do update
      set kind = excluded.kind, home_slot = excluded.home_slot, away_slot = excluded.away_slot,
          phase = excluded.phase,
          home_player1_id = excluded.home_player1_id, home_player2_id = excluded.home_player2_id,
          away_player1_id = excluded.away_player1_id, away_player2_id = excluded.away_player2_id,
          home_games = excluded.home_games, away_games = excluded.away_games,
          winner = excluded.winner, status = excluded.status
    where (eg.home_player1_id, eg.home_player2_id, eg.away_player1_id, eg.away_player2_id,
           eg.home_games, eg.away_games, eg.winner, eg.status)
          is distinct from
          (excluded.home_player1_id, excluded.home_player2_id, excluded.away_player1_id, excluded.away_player2_id,
           excluded.home_games, excluded.away_games, excluded.winner, excluded.status);
  end loop;

  -- e) result hash over everything a confirmation vouches for ------------------------
  select md5(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s', eg.match_number, eg.status, eg.winner,
                               eg.home_player1_id, eg.home_player2_id, eg.away_player1_id, eg.away_player2_id,
                               eg.home_games || '-' || eg.away_games,
                               (select string_agg(r.home_points || '-' || r.away_points, ',' order by r.game_number)
                                from public.reconciled_set_states r
                                where r.encounter_id = eg.encounter_id and r.match_number = eg.match_number
                                  and eg.status = 'completed' and r.game_number <= eg.home_games + eg.away_games)),
                        ';' order by eg.match_number))
    into v_hash
  from public.encounter_games eg where eg.encounter_id = p_encounter_id;

  -- f) status ---------------------------------------------------------------------------
  select exists (select 1 from public.reconciled_set_states where encounter_id = p_encounter_id) into v_any;
  if e.status = 'cancelled' then
    v_new_status := 'cancelled';
  elsif v_finished then
    select exists (select 1 from public.result_confirmations c
                   where c.encounter_id = p_encounter_id and c.side = 'home'
                     and c.result_hash = v_hash and c.invalidated_at is null) into v_home_ok;
    select exists (select 1 from public.result_confirmations c
                   where c.encounter_id = p_encounter_id and c.side = 'away'
                     and c.result_hash = v_hash and c.invalidated_at is null) into v_away_ok;
    v_new_status := case when v_home_ok and v_away_ok then 'completed' else 'awaiting_confirmation' end;
  elsif v_any then
    v_new_status := 'in_progress';
  elsif v_revealed then
    v_new_status := 'lineups';
  else
    v_new_status := 'scheduled';
  end if;

  update public.encounters
     set home_score = case when v_revealed then v_home end,
         away_score = case when v_revealed then v_away end,
         status = v_new_status,
         result_hash = v_hash,
         result_version = result_version + case when result_hash is distinct from v_hash then 1 else 0 end
   where id = p_encounter_id
     and (home_score, away_score, status, result_hash)
         is distinct from (case when v_revealed then v_home end, case when v_revealed then v_away end, v_new_status, v_hash);

  -- Permanent report (incl. doubles names) while officially confirmed.
  update public.encounters
     set final_report = case when v_new_status = 'completed' then public.encounter_report(p_encounter_id) end
   where id = p_encounter_id
     and (v_new_status = 'completed') <> (final_report is not null);
end;
$$;

-- Triggers --------------------------------------------------------------------------
create or replace function public.set_entries_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_enc uuid := coalesce(new.encounter_id, old.encounter_id);
begin
  perform public.lock_encounter(v_enc);
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.reconcile_game(old.encounter_id, old.match_number, old.game_number);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.reconcile_game(new.encounter_id, new.match_number, new.game_number);
  end if;
  perform public.recompute_encounter(v_enc);
  return null;
end;
$$;

create trigger set_entries_reconcile
  after insert or update or delete on public.set_entries
  for each row execute function public.set_entries_after_change();

create or replace function public.encounters_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_encounter(new.id);
  return null;
end;
$$;

create trigger encounters_init_games
  after insert on public.encounters
  for each row execute function public.encounters_after_insert();

-- ---------------------------------------------------------------------------
-- 8. Lineup RPCs (versioned, two different players per team)
-- p_slots: {"A": uuid, "B": uuid, "C": uuid} for home, X/Y/Z for away
-- ---------------------------------------------------------------------------
create or replace function public.propose_lineup(p_encounter_id uuid, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_side      public.team_side := public.session_side(p_encounter_id);
  v_player    uuid := public.session_player_id(p_encounter_id);
  v_enc       public.encounters;
  v_division  public.divisions;
  v_team_id   uuid;
  v_letters   text[];
  v_letter    text;
  v_player_id uuid;
  v_lineup    public.lineups;
begin
  if v_side is null or v_player is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  perform public.lock_encounter(p_encounter_id);
  select * into v_enc from public.encounters where id = p_encounter_id;
  if v_enc.status in ('completed', 'cancelled') then
    raise exception 'encounter_closed';
  end if;
  if exists (select 1 from public.lineups where encounter_id = p_encounter_id and side = v_side and locked_at is not null) then
    raise exception 'lineup_locked';
  end if;

  v_team_id := case v_side when 'home' then v_enc.home_team_id else v_enc.away_team_id end;
  v_letters := case v_side when 'home' then array['A', 'B', 'C'] else array['X', 'Y', 'Z'] end;
  select d.* into v_division from public.divisions d join public.rounds r on r.division_id = d.id
  where r.id = v_enc.round_id;

  if jsonb_typeof(p_slots) <> 'object' or (select count(*) from jsonb_object_keys(p_slots)) <> 3 then
    raise exception 'invalid_lineup';
  end if;
  foreach v_letter in array v_letters loop
    v_player_id := (p_slots ->> v_letter)::uuid;
    if v_player_id is null then
      raise exception 'invalid_lineup';
    end if;
    if not exists (
      select 1 from public.team_registrations tr
      where tr.player_id = v_player_id and tr.team_id = v_team_id and tr.is_active
        and tr.season_id = v_division.season_id and tr.division_id = v_division.id
    ) then
      raise exception 'player_not_registered';
    end if;
  end loop;
  if (select count(distinct value) from jsonb_each_text(p_slots)) <> 3 then
    raise exception 'duplicate_player';
  end if;

  insert into public.lineups (encounter_id, team_id, side, submitted_by, version, confirmed_count)
  values (p_encounter_id, v_team_id, v_side, auth.uid(), 1, 1)
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by,
        submitted_at = now(),
        version = public.lineups.version + 1,
        confirmed_count = 1,
        locked_at = null
  returning * into v_lineup;

  delete from public.lineup_slots where lineup_id = v_lineup.id;
  insert into public.lineup_slots (lineup_id, slot, player_id)
  select v_lineup.id, key, value::uuid from jsonb_each_text(p_slots);

  -- The proposer is confirmation #1 of the new version.
  insert into public.lineup_confirmations (lineup_id, auth_user_id, player_id, side, version)
  values (v_lineup.id, auth.uid(), v_player, v_side, v_lineup.version);

  return jsonb_build_object('lineup_id', v_lineup.id, 'version', v_lineup.version, 'confirmed_count', 1, 'locked', false);
end;
$$;

create or replace function public.confirm_lineup(p_lineup_id uuid, p_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lineup public.lineups;
  v_side   public.team_side;
  v_player uuid;
  v_count  integer;
begin
  select * into v_lineup from public.lineups where id = p_lineup_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_side := public.session_side(v_lineup.encounter_id);
  v_player := public.session_player_id(v_lineup.encounter_id);
  if v_side is null or v_side <> v_lineup.side then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.lock_encounter(v_lineup.encounter_id);
  select * into v_lineup from public.lineups where id = p_lineup_id;
  if v_lineup.locked_at is not null then
    return jsonb_build_object('version', v_lineup.version, 'confirmed_count', v_lineup.confirmed_count, 'locked', true);
  end if;
  if v_lineup.version <> p_version then
    raise exception 'lineup_changed';
  end if;

  insert into public.lineup_confirmations (lineup_id, auth_user_id, player_id, side, version)
  values (p_lineup_id, auth.uid(), v_player, v_side, v_lineup.version)
  on conflict (lineup_id, version, player_id) do nothing;

  select count(distinct player_id) into v_count
  from public.lineup_confirmations where lineup_id = p_lineup_id and version = v_lineup.version;

  update public.lineups
     set confirmed_count = v_count,
         locked_at = case when v_count >= 2 then now() end
   where id = p_lineup_id;

  -- Reveal both lineups simultaneously once both teams are locked.
  if (select count(*) from public.lineups where encounter_id = v_lineup.encounter_id and locked_at is not null) = 2 then
    update public.encounters set lineups_revealed_at = now()
    where id = v_lineup.encounter_id and lineups_revealed_at is null;
  end if;
  perform public.recompute_encounter(v_lineup.encounter_id);

  return jsonb_build_object('version', v_lineup.version, 'confirmed_count', v_count, 'locked', v_count >= 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Doubles RPCs – only once matches 1–6 are decided and the encounter is still open
-- ---------------------------------------------------------------------------
create or replace function public.propose_doubles(p_encounter_id uuid, p_player1 uuid, p_player2 uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_side     public.team_side := public.session_side(p_encounter_id);
  v_player   uuid := public.session_player_id(p_encounter_id);
  v_enc      public.encounters;
  v_division public.divisions;
  v_team_id  uuid;
  v_sel      public.doubles_selections;
begin
  if v_side is null or v_player is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  if p_player1 is null or p_player2 is null or p_player1 = p_player2 then
    raise exception 'duplicate_player';
  end if;
  perform public.lock_encounter(p_encounter_id);
  select * into v_enc from public.encounters where id = p_encounter_id;
  if v_enc.status in ('completed', 'cancelled') then
    raise exception 'encounter_closed';
  end if;
  if (select count(*) from public.encounter_games
      where encounter_id = p_encounter_id and match_number between 1 and 6 and status = 'completed') <> 6
     or exists (select 1 from public.encounter_games
                where encounter_id = p_encounter_id and match_number = 7 and status = 'not_played') then
    raise exception 'doubles_not_open';
  end if;
  if exists (select 1 from public.doubles_selections where encounter_id = p_encounter_id and side = v_side and locked_at is not null) then
    raise exception 'doubles_locked';
  end if;

  v_team_id := case v_side when 'home' then v_enc.home_team_id else v_enc.away_team_id end;
  select d.* into v_division from public.divisions d join public.rounds r on r.division_id = d.id
  where r.id = v_enc.round_id;
  if (select count(*) from public.team_registrations tr
      where tr.player_id in (p_player1, p_player2) and tr.team_id = v_team_id and tr.is_active
        and tr.season_id = v_division.season_id and tr.division_id = v_division.id) <> 2 then
    raise exception 'player_not_registered';
  end if;

  insert into public.doubles_selections (encounter_id, team_id, side, submitted_by, version, confirmed_count)
  values (p_encounter_id, v_team_id, v_side, auth.uid(), 1, 1)
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by,
        submitted_at = now(),
        version = public.doubles_selections.version + 1,
        confirmed_count = 1,
        locked_at = null
  returning * into v_sel;

  delete from public.doubles_players where doubles_selection_id = v_sel.id;
  insert into public.doubles_players (doubles_selection_id, player_id, position)
  values (v_sel.id, p_player1, 1), (v_sel.id, p_player2, 2);

  insert into public.doubles_confirmations (doubles_selection_id, auth_user_id, player_id, side, version)
  values (v_sel.id, auth.uid(), v_player, v_side, v_sel.version);

  return jsonb_build_object('selection_id', v_sel.id, 'version', v_sel.version, 'confirmed_count', 1, 'locked', false);
end;
$$;

create or replace function public.confirm_doubles(p_selection_id uuid, p_version integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sel    public.doubles_selections;
  v_side   public.team_side;
  v_player uuid;
  v_count  integer;
begin
  select * into v_sel from public.doubles_selections where id = p_selection_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_side := public.session_side(v_sel.encounter_id);
  v_player := public.session_player_id(v_sel.encounter_id);
  if v_side is null or v_side <> v_sel.side then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.lock_encounter(v_sel.encounter_id);
  select * into v_sel from public.doubles_selections where id = p_selection_id;
  if v_sel.locked_at is not null then
    return jsonb_build_object('version', v_sel.version, 'confirmed_count', v_sel.confirmed_count, 'locked', true);
  end if;
  if v_sel.version <> p_version then
    raise exception 'doubles_changed';
  end if;

  insert into public.doubles_confirmations (doubles_selection_id, auth_user_id, player_id, side, version)
  values (p_selection_id, auth.uid(), v_player, v_side, v_sel.version)
  on conflict (doubles_selection_id, version, player_id) do nothing;

  select count(distinct player_id) into v_count
  from public.doubles_confirmations where doubles_selection_id = p_selection_id and version = v_sel.version;

  update public.doubles_selections
     set confirmed_count = v_count,
         locked_at = case when v_count >= 2 then now() end
   where id = p_selection_id;

  if (select count(*) from public.doubles_selections where encounter_id = v_sel.encounter_id and locked_at is not null) = 2 then
    update public.encounters set doubles_revealed_at = now()
    where id = v_sel.encounter_id and doubles_revealed_at is null;
  end if;
  perform public.recompute_encounter(v_sel.encounter_id);

  return jsonb_build_object('version', v_sel.version, 'confirmed_count', v_count, 'locked', v_count >= 2);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Game score entry – one editable entry per scorer per game, idempotent by
--     client_entry_id (safe to retry from the offline outbox).
-- ---------------------------------------------------------------------------
create or replace function public.submit_game_score(
  p_client_entry_id uuid,
  p_encounter_id    uuid,
  p_match_number    integer,
  p_game_number     integer,
  p_home_points     integer,
  p_away_points     integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_side     public.team_side := public.session_side(p_encounter_id);
  v_player   uuid := public.session_player_id(p_encounter_id);
  v_existing public.set_entries;
  v_enc      public.encounters;
  v_game     public.encounter_games;
  v_prev     integer;
  v_hw       integer;
  v_aw       integer;
  v_state    public.reconciled_set_states;
begin
  if v_side is null or v_player is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  if p_client_entry_id is null then
    raise exception 'missing_client_entry_id';
  end if;
  perform public.lock_encounter(p_encounter_id);

  -- Idempotent retry: this exact submission was already applied.
  select * into v_existing from public.set_entries where client_entry_id = p_client_entry_id;
  if found then
    if v_existing.encounter_id <> p_encounter_id or v_existing.submitted_by_player_id <> v_player then
      raise exception 'client_entry_conflict';
    end if;
    select * into v_state from public.reconciled_set_states
    where encounter_id = v_existing.encounter_id and match_number = v_existing.match_number
      and game_number = v_existing.game_number;
    return jsonb_build_object('duplicate', true, 'status', v_state.status,
      'home_points', v_state.home_points, 'away_points', v_state.away_points,
      'submitter_count', v_state.submitter_count);
  end if;

  select * into v_enc from public.encounters where id = p_encounter_id;
  if v_enc.status = 'completed' then
    raise exception 'encounter_confirmed';
  elsif v_enc.status = 'cancelled' then
    raise exception 'encounter_closed';
  end if;
  if p_match_number not between 1 and 10 or p_game_number not between 1 and 5 then
    raise exception 'invalid_game';
  end if;
  if not public.is_valid_set_score(p_home_points, p_away_points) then
    raise exception 'invalid_game_score';
  end if;

  select * into v_game from public.encounter_games
  where encounter_id = p_encounter_id and match_number = p_match_number;
  if not found or v_game.status in ('locked', 'not_played') then
    raise exception 'match_not_available';
  end if;

  select * into v_existing from public.set_entries
  where encounter_id = p_encounter_id and match_number = p_match_number
    and game_number = p_game_number and submitted_by_player_id = v_player;

  if not found then
    -- A new game needs every earlier game recorded and the match still undecided.
    select count(*),
           count(*) filter (where status = 'agreed' and home_points > away_points),
           count(*) filter (where status = 'agreed' and away_points > home_points)
      into v_prev, v_hw, v_aw
    from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match_number and game_number < p_game_number;
    if v_prev <> p_game_number - 1 then
      raise exception 'previous_game_missing';
    end if;
    if v_hw >= 3 or v_aw >= 3 then
      raise exception 'match_already_decided';
    end if;
  end if;

  insert into public.set_entries
    (encounter_id, match_number, game_number, side, home_points, away_points,
     auth_user_id, submitted_by_player_id, client_entry_id)
  values
    (p_encounter_id, p_match_number, p_game_number, v_side, p_home_points, p_away_points,
     auth.uid(), v_player, p_client_entry_id)
  on conflict (encounter_id, match_number, game_number, submitted_by_player_id) do update
    set home_points = excluded.home_points,
        away_points = excluded.away_points,
        auth_user_id = excluded.auth_user_id,
        side = excluded.side,
        client_entry_id = excluded.client_entry_id;
  -- set_entries_reconcile trigger has now reconciled the game and recomputed the encounter.

  select * into v_state from public.reconciled_set_states
  where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
  return jsonb_build_object('duplicate', false, 'status', v_state.status,
    'home_points', v_state.home_points, 'away_points', v_state.away_points,
    'submitter_count', v_state.submitter_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Result confirmation: one player per team, bound to the current result hash
-- ---------------------------------------------------------------------------
create or replace function public.confirm_result(p_encounter_id uuid, p_result_hash text)
returns public.encounter_status language plpgsql security definer set search_path = public as $$
declare
  v_side   public.team_side := public.session_side(p_encounter_id);
  v_player uuid := public.session_player_id(p_encounter_id);
  v_enc    public.encounters;
begin
  if v_side is null or v_player is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  perform public.lock_encounter(p_encounter_id);
  perform public.recompute_encounter(p_encounter_id);
  select * into v_enc from public.encounters where id = p_encounter_id;
  if v_enc.status not in ('awaiting_confirmation', 'completed') then
    raise exception 'encounter_not_finished';
  end if;
  if v_enc.result_hash is distinct from p_result_hash then
    raise exception 'result_changed';
  end if;

  if not exists (select 1 from public.result_confirmations
                 where encounter_id = p_encounter_id and side = v_side
                   and result_hash = v_enc.result_hash and invalidated_at is null) then
    insert into public.result_confirmations
      (encounter_id, side, auth_user_id, player_id, result_hash, result_version, snapshot)
    values
      (p_encounter_id, v_side, auth.uid(), v_player, v_enc.result_hash, v_enc.result_version,
       public.encounter_report(p_encounter_id));
  end if;

  perform public.recompute_encounter(p_encounter_id);
  select status into v_enc.status from public.encounters where id = p_encounter_id;
  return v_enc.status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Organizer tools (each writes an explicit audit event)
-- ---------------------------------------------------------------------------
create or replace function public.admin_unlock_lineup(p_lineup_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lineup public.lineups;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_lineup from public.lineups where id = p_lineup_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.lock_encounter(v_lineup.encounter_id);
  update public.lineups
     set locked_at = null, confirmed_count = 0, version = version + 1
   where id = p_lineup_id;
  update public.encounters set lineups_revealed_at = null where id = v_lineup.encounter_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'unlock_lineup', 'lineups', p_lineup_id,
          jsonb_build_object('encounter_id', v_lineup.encounter_id, 'side', v_lineup.side, 'reason', p_reason));
  perform public.recompute_encounter(v_lineup.encounter_id);
end;
$$;

create or replace function public.admin_unlock_doubles(p_selection_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sel public.doubles_selections;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_sel from public.doubles_selections where id = p_selection_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.lock_encounter(v_sel.encounter_id);
  update public.doubles_selections
     set locked_at = null, confirmed_count = 0, version = version + 1
   where id = p_selection_id;
  update public.encounters set doubles_revealed_at = null where id = v_sel.encounter_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'unlock_doubles', 'doubles_selections', p_selection_id,
          jsonb_build_object('encounter_id', v_sel.encounter_id, 'side', v_sel.side, 'reason', p_reason));
  perform public.recompute_encounter(v_sel.encounter_id);
end;
$$;

create or replace function public.admin_reopen_encounter(p_encounter_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.lock_encounter(p_encounter_id);
  update public.result_confirmations set invalidated_at = now()
  where encounter_id = p_encounter_id and invalidated_at is null;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'reopen_encounter', 'encounters', p_encounter_id, jsonb_build_object('reason', p_reason));
  perform public.recompute_encounter(p_encounter_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. Row Level Security changes
-- ---------------------------------------------------------------------------
-- Lineup/doubles rows carry only status (version, confirmed_count, locked_at): public.
drop policy if exists lineups_read on public.lineups;
create policy lineups_status_read on public.lineups for select using (true);
drop policy if exists doubles_selections_read on public.doubles_selections;
create policy doubles_selections_status_read on public.doubles_selections for select using (true);

-- Actual assignments: own team before reveal, everybody after reveal, organizers always.
drop policy if exists lineup_slots_read on public.lineup_slots;
create policy lineup_slots_read on public.lineup_slots for select using (
  exists (
    select 1 from public.lineups l join public.encounters e on e.id = l.encounter_id
    where l.id = lineup_id
      and (e.lineups_revealed_at is not null or public.session_side(l.encounter_id) = l.side)
  )
);
drop policy if exists lineup_confirmations_read on public.lineup_confirmations;
create policy lineup_confirmations_read on public.lineup_confirmations for select using (
  public.is_organizer() or exists (
    select 1 from public.lineups l join public.encounters e on e.id = l.encounter_id
    where l.id = lineup_id
      and (e.lineups_revealed_at is not null or public.session_side(l.encounter_id) = l.side)
  )
);
drop policy if exists doubles_players_read on public.doubles_players;
create policy doubles_players_read on public.doubles_players for select using (
  exists (
    select 1 from public.doubles_selections d join public.encounters e on e.id = d.encounter_id
    where d.id = doubles_selection_id
      and (e.doubles_revealed_at is not null or public.session_side(d.encounter_id) = d.side)
  )
);
drop policy if exists doubles_confirmations_read on public.doubles_confirmations;
create policy doubles_confirmations_read on public.doubles_confirmations for select using (
  public.is_organizer() or exists (
    select 1 from public.doubles_selections d join public.encounters e on e.id = d.encounter_id
    where d.id = doubles_selection_id
      and (e.doubles_revealed_at is not null or public.session_side(d.encounter_id) = d.side)
  )
);

-- Raw entries: every joined participant of the encounter (to inspect conflicts) + organizers.
drop policy if exists set_entries_read on public.set_entries;
create policy set_entries_read on public.set_entries for select to authenticated using (
  public.session_side(encounter_id) is not null or public.is_organizer()
);

-- Reconciled rows are public; conflicted rows carry no points ("Lota í staðfestingu").
drop policy if exists reconciled_set_states_read on public.reconciled_set_states;
create policy reconciled_set_states_public_read on public.reconciled_set_states for select using (true);

-- Realtime: participants receive raw entries (RLS applies to broadcasts).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'set_entries') then
    alter publication supabase_realtime add table public.set_entries;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. Execute permissions
-- ---------------------------------------------------------------------------
revoke execute on function public.reconcile_game(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.recompute_encounter(uuid) from public, anon, authenticated;
revoke execute on function public.lock_encounter(uuid) from public, anon, authenticated;
revoke execute on function public.set_entries_after_change() from public, anon, authenticated;
revoke execute on function public.encounters_after_insert() from public, anon, authenticated;

revoke execute on function public.propose_lineup(uuid, jsonb) from public, anon;
revoke execute on function public.confirm_lineup(uuid, integer) from public, anon;
revoke execute on function public.propose_doubles(uuid, uuid, uuid) from public, anon;
revoke execute on function public.confirm_doubles(uuid, integer) from public, anon;
revoke execute on function public.submit_game_score(uuid, uuid, integer, integer, integer, integer) from public, anon;
revoke execute on function public.confirm_result(uuid, text) from public, anon;
revoke execute on function public.admin_unlock_lineup(uuid, text) from public, anon;
revoke execute on function public.admin_unlock_doubles(uuid, text) from public, anon;
revoke execute on function public.admin_reopen_encounter(uuid, text) from public, anon;

grant execute on function public.propose_lineup(uuid, jsonb) to authenticated;
grant execute on function public.confirm_lineup(uuid, integer) to authenticated;
grant execute on function public.propose_doubles(uuid, uuid, uuid) to authenticated;
grant execute on function public.confirm_doubles(uuid, integer) to authenticated;
grant execute on function public.submit_game_score(uuid, uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.confirm_result(uuid, text) to authenticated;
grant execute on function public.admin_unlock_lineup(uuid, text) to authenticated;
grant execute on function public.admin_unlock_doubles(uuid, text) to authenticated;
grant execute on function public.admin_reopen_encounter(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 15. Backfill derived rows for encounters that already exist
-- ---------------------------------------------------------------------------
select public.recompute_encounter(id) from public.encounters;
