-- ============================================================================
-- Conflicted games are resolved by ONE identified player (replaces the two-team
-- agreement of 20261005000100).
--
-- Borðtennis Live trusts participants: a conflict is almost always a typo, so any
-- player of either team in the encounter picks the correct score and the game is
-- resolved immediately. No second confirmation, no majority voting.
--
--   * game_conflict_confirmations is kept (name unchanged, no data removed) and now
--     means: one player's resolution of a game. The newest active row is the current
--     resolution; earlier ones are superseded and kept as history, with player, team
--     side, round session and timestamp. Raw set_entries are never changed.
--   * Precedence in reconcile_game:
--       organizer correction > newest player resolution > identical raw entries > conflict
--     A resolution stays in force until a newer resolution or an organizer correction
--     (raw entries edited afterwards do not silently override an explicit decision).
--   * A resolved game can be corrected the same way until the encounter is officially
--     confirmed; after that only an organizer can change it (unchanged).
--   * Deprecated: the "one active row per team side" rule. Existing rows are kept;
--     where both sides had an active row, the older one is marked superseded.
-- ============================================================================

-- 1. Which round session resolved the game (kept if the session ends later).
alter table public.game_conflict_confirmations
  add column round_session_id uuid references public.round_sessions (id) on delete set null;

comment on table public.game_conflict_confirmations is
  'Player resolutions of conflicted games (one player decides; newest active row is current; superseded rows are history). Raw set_entries are never changed.';
comment on column public.game_conflict_confirmations.side is 'Team side of the resolving player (informational).';

-- 2. One active resolution per game instead of one per team side.
drop index if exists public.game_conflict_confirmations_one_active_per_side;

update public.game_conflict_confirmations c
   set superseded_at = now()
 where c.superseded_at is null
   and exists (
     select 1 from public.game_conflict_confirmations n
      where n.encounter_id = c.encounter_id and n.match_number = c.match_number and n.game_number = c.game_number
        and n.superseded_at is null
        and (n.created_at, n.id) > (c.created_at, c.id)
   );

create unique index game_conflict_confirmations_one_active_per_game
  on public.game_conflict_confirmations (encounter_id, match_number, game_number)
  where superseded_at is null;

-- 3. Reconciliation: organizer > newest player resolution > identical raw entries > conflict.
create or replace function public.reconcile_game(p_encounter_id uuid, p_match integer, p_game integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count    integer;
  v_distinct integer;
  v_home     integer;
  v_away     integer;
  v_corr     public.game_corrections;
  v_res      public.game_conflict_confirmations;
  v_status   public.set_state_status;
begin
  select count(*), count(distinct (home_points, away_points)), min(home_points), min(away_points)
    into v_count, v_distinct, v_home, v_away
  from public.set_entries
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;

  -- 1. An organizer correction is the canonical score for this game.
  select * into v_corr from public.game_corrections
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;
  if found then
    insert into public.reconciled_set_states
      (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, corrected, updated_at)
    values (p_encounter_id, p_match, p_game, 'agreed', v_corr.home_points, v_corr.away_points, v_count, true, now())
    on conflict (encounter_id, match_number, game_number) do update
      set status = 'agreed', home_points = excluded.home_points, away_points = excluded.away_points,
          submitter_count = excluded.submitter_count, corrected = true, updated_at = now();
    return;
  end if;

  -- 2. The newest player resolution.
  select * into v_res from public.game_conflict_confirmations
  where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game
    and superseded_at is null;
  if found then
    v_status := 'agreed';
    v_home := v_res.home_points;
    v_away := v_res.away_points;
  elsif v_count = 0 then
    delete from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;
    return;
  elsif v_distinct = 1 then
    -- 3. Identical raw entries agree.
    v_status := 'agreed';
  else
    -- 4. Different raw entries and no resolution yet.
    v_status := 'conflict';
    v_home := null;
    v_away := null;
  end if;

  insert into public.reconciled_set_states
    (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, corrected, updated_at)
  values (p_encounter_id, p_match, p_game, v_status, v_home, v_away, v_count, false, now())
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

-- 4. Player RPC: resolve (or correct the resolution of) a game. One player is enough.
create or replace function public.confirm_game_resolution(
  p_client_request_id uuid,
  p_encounter_id      uuid,
  p_match_number      integer,
  p_game_number       integer,
  p_home_points       integer,
  p_away_points       integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  -- Eligibility comes from the caller's own round session in THIS encounter: an identified
  -- player of either participating team. Never from the client.
  v_side      public.team_side := public.session_side(p_encounter_id);
  v_player    uuid := public.session_player_id(p_encounter_id);
  v_session   uuid;
  v_existing  public.game_conflict_confirmations;
  v_active    public.game_conflict_confirmations;
  v_enc       public.encounters;
  v_state     public.reconciled_set_states;
  v_duplicate boolean := false;
begin
  if v_side is null or v_player is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'missing_client_request_id';
  end if;
  perform public.lock_encounter(p_encounter_id);

  select * into v_existing from public.game_conflict_confirmations where client_request_id = p_client_request_id;
  if found then
    -- Retry of a request that was already applied (double tap, reconnect).
    if v_existing.encounter_id <> p_encounter_id or v_existing.player_id <> v_player then
      raise exception 'client_request_conflict';
    end if;
    v_duplicate := true;
  else
    select * into v_enc from public.encounters where id = p_encounter_id;
    if v_enc.status = 'completed' then
      raise exception 'encounter_confirmed';
    elsif v_enc.status in ('cancelled', 'postponed') then
      raise exception 'encounter_closed';
    end if;
    if p_match_number not between 1 and 10 or p_game_number not between 1 and 5 then
      raise exception 'invalid_game';
    end if;
    if not public.is_valid_set_score(p_home_points, p_away_points) then
      raise exception 'invalid_game_score';
    end if;

    select * into v_active from public.game_conflict_confirmations
    where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number
      and superseded_at is null
    for update;

    -- Allowed while the game is in conflict, or to correct an earlier resolution.
    select * into v_state from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
    if v_active.id is null and (v_state.encounter_id is null or v_state.status <> 'conflict') then
      raise exception 'not_in_conflict';
    end if;

    -- The current resolution already says exactly this: nothing to change.
    if not (v_active.id is not null and v_active.home_points = p_home_points and v_active.away_points = p_away_points) then
      if v_active.id is not null then
        update public.game_conflict_confirmations set superseded_at = now() where id = v_active.id;
      end if;
      select id into v_session from public.round_sessions
      where auth_user_id = auth.uid() and encounter_id = p_encounter_id
      order by joined_at desc limit 1;
      insert into public.game_conflict_confirmations
        (encounter_id, match_number, game_number, side, player_id, auth_user_id, round_session_id,
         home_points, away_points, client_request_id)
      values
        (p_encounter_id, p_match_number, p_game_number, v_side, v_player, auth.uid(), v_session,
         p_home_points, p_away_points, p_client_request_id);
      perform public.reconcile_game(p_encounter_id, p_match_number, p_game_number);
      perform public.recompute_encounter(p_encounter_id);
    end if;
  end if;

  select * into v_state from public.reconciled_set_states
  where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
  return jsonb_build_object(
    'duplicate', v_duplicate,
    'status', v_state.status,
    'home_points', v_state.home_points,
    'away_points', v_state.away_points
  );
end;
$$;

revoke execute on function public.reconcile_game(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.confirm_game_resolution(uuid, uuid, integer, integer, integer, integer) from public, anon;
grant execute on function public.confirm_game_resolution(uuid, uuid, integer, integer, integer, integer) to authenticated;

-- 5. Games that were waiting for the second team now follow the new rule.
do $$
declare
  g record;
begin
  for g in
    select distinct c.encounter_id, c.match_number, c.game_number
      from public.game_conflict_confirmations c
      join public.reconciled_set_states r
        on r.encounter_id = c.encounter_id and r.match_number = c.match_number and r.game_number = c.game_number
      join public.encounters e on e.id = c.encounter_id
     where c.superseded_at is null and r.status = 'conflict'
       and e.status not in ('completed', 'cancelled', 'postponed')
  loop
    perform public.reconcile_game(g.encounter_id, g.match_number, g.game_number);
    perform public.recompute_encounter(g.encounter_id);
  end loop;
end;
$$;
