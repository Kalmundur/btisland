-- ============================================================================
-- Borðtennis Live – phase 3: league administration
--
--  * competition formats (divisions reference a format key; only REGULAR_TEN_MATCH
--    is implemented – a seven-match playoff format can be added later)
--  * clubs/teams: active flag, optional short name and logo URL
--  * organizer game corrections (take precedence in reconciliation, fully audited)
--  * postponed/cancelled encounters: kept by the derivation, closed for players
--  * explicit audited admin RPCs for corrections and status changes
--
-- Standings and player statistics are NOT stored anywhere: they are derived from
-- officially confirmed encounters (status = 'completed') in the application.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Competition formats
-- ---------------------------------------------------------------------------
create table public.competition_formats (
  key          text primary key,
  name         text not null,
  match_count  smallint not null check (match_count > 0),
  wins_to_take smallint not null check (wins_to_take > 0)
);
insert into public.competition_formats (key, name, match_count, wins_to_take)
values ('REGULAR_TEN_MATCH', 'Deildarkeppni – 10 leikir', 10, 6);

alter table public.competition_formats enable row level security;
create policy competition_formats_public_read on public.competition_formats for select using (true);

alter table public.match_format
  add column format_key text not null default 'REGULAR_TEN_MATCH'
    references public.competition_formats (key);

alter table public.divisions
  add column format_key text not null default 'REGULAR_TEN_MATCH'
    references public.competition_formats (key);

-- ---------------------------------------------------------------------------
-- 2. Clubs and teams
-- ---------------------------------------------------------------------------
alter table public.clubs
  add column is_active boolean not null default true,
  add column logo_url text;
alter table public.clubs alter column short_name drop not null;

alter table public.teams
  add column is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. Organizer corrections of individual games
--    A correction overrides the scorers' entries for that game (which are kept).
-- ---------------------------------------------------------------------------
create table public.game_corrections (
  encounter_id uuid not null references public.encounters (id) on delete cascade,
  match_number smallint not null check (match_number between 1 and 10),
  game_number  smallint not null check (game_number between 1 and 5),
  home_points  smallint not null,
  away_points  smallint not null,
  reason       text,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (encounter_id, match_number, game_number),
  check (public.is_valid_set_score(home_points, away_points))
);
alter table public.game_corrections enable row level security;
create policy game_corrections_organizer_all on public.game_corrections
  for all to authenticated using (public.is_organizer()) with check (public.is_organizer());
create trigger game_corrections_audit after insert or update or delete on public.game_corrections
  for each row execute function public.audit_row_change();

alter table public.reconciled_set_states
  add column corrected boolean not null default false;

create or replace function public.reconcile_game(p_encounter_id uuid, p_match integer, p_game integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count    integer;
  v_distinct integer;
  v_home     integer;
  v_away     integer;
  v_corr     public.game_corrections;
begin
  select count(*), count(distinct (home_points, away_points)), min(home_points), min(away_points)
    into v_count, v_distinct, v_home, v_away
  from public.set_entries
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;

  select * into v_corr from public.game_corrections
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;

  if found then
    -- An organizer correction is the canonical score for this game.
    insert into public.reconciled_set_states
      (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, corrected, updated_at)
    values (p_encounter_id, p_match, p_game, 'agreed', v_corr.home_points, v_corr.away_points, v_count, true, now())
    on conflict (encounter_id, match_number, game_number) do update
      set status = 'agreed', home_points = excluded.home_points, away_points = excluded.away_points,
          submitter_count = excluded.submitter_count, corrected = true, updated_at = now();
    return;
  end if;

  if v_count = 0 then
    delete from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;
    return;
  end if;

  insert into public.reconciled_set_states
    (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, corrected, updated_at)
  values (
    p_encounter_id, p_match, p_game,
    case when v_distinct = 1 then 'agreed'::public.set_state_status else 'conflict'::public.set_state_status end,
    case when v_distinct = 1 then v_home end,
    case when v_distinct = 1 then v_away end,
    v_count, false, now()
  )
  on conflict (encounter_id, match_number, game_number) do update
    set status = excluded.status,
        home_points = excluded.home_points,
        away_points = excluded.away_points,
        submitter_count = excluded.submitter_count,
        corrected = false,
        updated_at = now()
  where (reconciled_set_states.status, reconciled_set_states.home_points, reconciled_set_states.away_points,
         reconciled_set_states.submitter_count, reconciled_set_states.corrected)
        is distinct from
        (excluded.status, excluded.home_points, excluded.away_points, excluded.submitter_count, false);
end;
$$;

create or replace function public.game_corrections_after_change()
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

create trigger game_corrections_reconcile
  after insert or update or delete on public.game_corrections
  for each row execute function public.game_corrections_after_change();

-- ---------------------------------------------------------------------------
-- 4. Derived state keeps organizer-set postponed/cancelled statuses
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
  if e.status in ('cancelled', 'postponed') then
    -- Organizer-set statuses are kept until the organizer restores the encounter.
    v_new_status := e.status;
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

-- Players cannot change anything in a postponed or cancelled encounter.
create or replace function public.guard_encounter_open()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status public.encounter_status;
begin
  select status into v_status from public.encounters where id = new.encounter_id;
  if v_status in ('postponed', 'cancelled') and not public.is_organizer() then
    raise exception 'encounter_closed';
  end if;
  return new;
end;
$$;

create trigger set_entries_guard_open before insert or update on public.set_entries
  for each row execute function public.guard_encounter_open();
create trigger lineups_guard_open before insert or update on public.lineups
  for each row execute function public.guard_encounter_open();
create trigger doubles_guard_open before insert or update on public.doubles_selections
  for each row execute function public.guard_encounter_open();

-- ---------------------------------------------------------------------------
-- 5. Audited organizer RPCs
-- ---------------------------------------------------------------------------
create or replace function public.admin_correct_game(
  p_encounter_id uuid,
  p_match_number integer,
  p_game_number  integer,
  p_home_points  integer,
  p_away_points  integer,
  p_reason       text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_before  public.reconciled_set_states;
  v_version integer;
  v_after   integer;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.is_valid_set_score(p_home_points, p_away_points) then
    raise exception 'invalid_game_score';
  end if;
  perform public.lock_encounter(p_encounter_id);
  select * into v_before from public.reconciled_set_states
  where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
  select result_version into v_version from public.encounters where id = p_encounter_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.game_corrections (encounter_id, match_number, game_number, home_points, away_points, reason, created_by)
  values (p_encounter_id, p_match_number, p_game_number, p_home_points, p_away_points, p_reason, auth.uid())
  on conflict (encounter_id, match_number, game_number) do update
    set home_points = excluded.home_points, away_points = excluded.away_points,
        reason = excluded.reason, created_by = excluded.created_by, created_at = now();
  -- Trigger has reconciled + recomputed; a changed result hash bumps result_version and
  -- earlier final confirmations no longer match (the result needs confirming again).

  select result_version into v_after from public.encounters where id = p_encounter_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'correct_game', 'encounters', p_encounter_id, jsonb_build_object(
    'encounter_id', p_encounter_id,
    'match', p_match_number, 'game', p_game_number,
    'before', case when v_before.encounter_id is null then null
                   else jsonb_build_object('status', v_before.status, 'home', v_before.home_points, 'away', v_before.away_points) end,
    'after', jsonb_build_object('home', p_home_points, 'away', p_away_points),
    'result_version_before', v_version, 'result_version_after', v_after,
    'reason', p_reason));
end;
$$;

create or replace function public.admin_clear_correction(
  p_encounter_id uuid, p_match_number integer, p_game_number integer, p_reason text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_corr public.game_corrections;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.lock_encounter(p_encounter_id);
  delete from public.game_corrections
  where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number
  returning * into v_corr;
  if v_corr.encounter_id is null then
    return;
  end if;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'clear_correction', 'encounters', p_encounter_id, jsonb_build_object(
    'encounter_id', p_encounter_id, 'match', p_match_number, 'game', p_game_number,
    'before', jsonb_build_object('home', v_corr.home_points, 'away', v_corr.away_points), 'reason', p_reason));
end;
$$;

-- p_status: 'postponed' | 'cancelled' | 'active' (back to the derived status)
create or replace function public.admin_set_encounter_status(p_encounter_id uuid, p_status text, p_reason text default null)
returns public.encounter_status language plpgsql security definer set search_path = public as $$
declare
  v_before public.encounter_status;
  v_after  public.encounter_status;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status not in ('postponed', 'cancelled', 'active') then
    raise exception 'invalid_status';
  end if;
  perform public.lock_encounter(p_encounter_id);
  select status into v_before from public.encounters where id = p_encounter_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  update public.encounters
     set status = case when p_status = 'active' then 'scheduled'::public.encounter_status
                       else p_status::public.encounter_status end
   where id = p_encounter_id;
  perform public.recompute_encounter(p_encounter_id);
  select status into v_after from public.encounters where id = p_encounter_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'set_status', 'encounters', p_encounter_id, jsonb_build_object(
    'encounter_id', p_encounter_id, 'before', v_before, 'after', v_after, 'reason', p_reason));
  return v_after;
end;
$$;

revoke execute on function public.game_corrections_after_change() from public, anon, authenticated;
revoke execute on function public.guard_encounter_open() from public, anon, authenticated;
revoke execute on function public.admin_correct_game(uuid, integer, integer, integer, integer, text) from public, anon;
revoke execute on function public.admin_clear_correction(uuid, integer, integer, text) from public, anon;
revoke execute on function public.admin_set_encounter_status(uuid, text, text) from public, anon;
grant execute on function public.admin_correct_game(uuid, integer, integer, integer, integer, text) to authenticated;
grant execute on function public.admin_clear_correction(uuid, integer, integer, text) to authenticated;
grant execute on function public.admin_set_encounter_status(uuid, text, text) to authenticated;

-- Organizer dashboards listen to these without a per-encounter filter.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lineup_confirmations') then
    alter publication supabase_realtime add table public.lineup_confirmations;
  end if;
end;
$$;
