-- ============================================================================
-- Conflicted games can always be resolved – no single scorer can deadlock an encounter.
--
-- Resolution paths (no majority voting, raw entries are never changed or deleted):
--   1. The scorer who entered a different score edits their own entry (unchanged).
--   2. Cross-team agreement: one player of the HOME team and one player of the AWAY team
--      confirm the same valid score (game_conflict_confirmations).
--   3. Organizer override (game_corrections / admin_correct_game, unchanged).
--
-- Precedence in reconcile_game:
--   organizer correction > cross-team agreement > identical raw entries > conflict
-- ============================================================================

create table public.game_conflict_confirmations (
  id                uuid primary key default gen_random_uuid(),
  encounter_id      uuid not null references public.encounters (id) on delete cascade,
  match_number      smallint not null check (match_number between 1 and 10),
  game_number       smallint not null check (game_number between 1 and 5),
  side              public.team_side not null,
  player_id         uuid not null references public.players (id) on delete cascade,
  auth_user_id      uuid default auth.uid() references auth.users (id) on delete set null,
  home_points       smallint not null,
  away_points       smallint not null,
  -- Idempotency: a retried request (double tap, reconnect) never creates a second row.
  client_request_id uuid not null unique,
  created_at        timestamptz not null default now(),
  -- A newer confirmation from the same team replaces this one; the row is kept as history.
  superseded_at     timestamptz,
  check (public.is_valid_set_score(home_points, away_points))
);

-- One active confirmation per team side and game: a team speaks with one voice, so two
-- players of the same team can never "outvote" anything.
create unique index game_conflict_confirmations_one_active_per_side
  on public.game_conflict_confirmations (encounter_id, match_number, game_number, side)
  where superseded_at is null;
create index game_conflict_confirmations_encounter_idx
  on public.game_conflict_confirmations (encounter_id, match_number, game_number);

alter table public.game_conflict_confirmations enable row level security;
-- Participants of the encounter and organizers only; the public never sees who confirmed.
create policy game_conflict_confirmations_read on public.game_conflict_confirmations
  for select to authenticated using (public.session_side(encounter_id) is not null or public.is_organizer());
revoke all on public.game_conflict_confirmations from anon, authenticated;
grant select (id, encounter_id, match_number, game_number, side, player_id, home_points, away_points,
              created_at, superseded_at)
  on public.game_conflict_confirmations to authenticated;

create trigger game_conflict_confirmations_audit after insert or update or delete on public.game_conflict_confirmations
  for each row execute function public.audit_row_change();
create trigger game_conflict_confirmations_guard_open before insert or update on public.game_conflict_confirmations
  for each row execute function public.guard_encounter_open();

-- ---------------------------------------------------------------------------
-- Reconciliation with the full precedence model
-- ---------------------------------------------------------------------------
create or replace function public.reconcile_game(p_encounter_id uuid, p_match integer, p_game integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_count    integer;
  v_distinct integer;
  v_home     integer;
  v_away     integer;
  v_corr     public.game_corrections;
  v_res_home integer;
  v_res_away integer;
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

  -- 2. Cross-team agreement: the active home and away confirmations name the same score
  --    and come from two different players.
  select h.home_points, h.away_points into v_res_home, v_res_away
  from public.game_conflict_confirmations h
  join public.game_conflict_confirmations a
    on a.encounter_id = h.encounter_id and a.match_number = h.match_number and a.game_number = h.game_number
   and a.side = 'away' and a.superseded_at is null
   and a.home_points = h.home_points and a.away_points = h.away_points
   and a.player_id <> h.player_id
  where h.encounter_id = p_encounter_id and h.match_number = p_match and h.game_number = p_game
    and h.side = 'home' and h.superseded_at is null;
  if found then
    insert into public.reconciled_set_states
      (encounter_id, match_number, game_number, status, home_points, away_points, submitter_count, corrected, updated_at)
    values (p_encounter_id, p_match, p_game, 'agreed', v_res_home, v_res_away, v_count, false, now())
    on conflict (encounter_id, match_number, game_number) do update
      set status = 'agreed', home_points = excluded.home_points, away_points = excluded.away_points,
          submitter_count = excluded.submitter_count, corrected = false, updated_at = now()
    where (reconciled_set_states.status, reconciled_set_states.home_points, reconciled_set_states.away_points,
           reconciled_set_states.submitter_count, reconciled_set_states.corrected)
          is distinct from ('agreed'::public.set_state_status, excluded.home_points, excluded.away_points,
                            excluded.submitter_count, false);
    return;
  end if;

  -- No conflict any more (raw entries agree, or none): unmatched team confirmations are moot.
  -- They are kept as history, just no longer active.
  if v_count = 0 or v_distinct = 1 then
    update public.game_conflict_confirmations
       set superseded_at = now()
     where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game
       and superseded_at is null;
  end if;

  if v_count = 0 then
    delete from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match and game_number = p_game;
    return;
  end if;

  -- 3. Identical raw entries agree; 4. otherwise the game is in conflict.
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

-- ---------------------------------------------------------------------------
-- Player RPC: confirm the correct score of a conflicted game for one's own team
-- ---------------------------------------------------------------------------
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
  -- The side comes from the player's own round session, never from the client.
  v_side     public.team_side := public.session_side(p_encounter_id);
  v_player   uuid := public.session_player_id(p_encounter_id);
  v_existing public.game_conflict_confirmations;
  v_active   public.game_conflict_confirmations;
  v_enc      public.encounters;
  v_state    public.reconciled_set_states;
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
    -- Retry of a request that was already applied.
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

    select * into v_state from public.reconciled_set_states
    where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
    if not found or v_state.status <> 'conflict' then
      raise exception 'not_in_conflict';
    end if;

    select * into v_active from public.game_conflict_confirmations
    where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number
      and side = v_side and superseded_at is null
    for update;

    -- The team already confirmed exactly this score: nothing to change.
    if not (found and v_active.home_points = p_home_points and v_active.away_points = p_away_points) then
      if found then
        -- Same team, different score: the newer confirmation replaces it (kept as history).
        update public.game_conflict_confirmations set superseded_at = now() where id = v_active.id;
      end if;
      insert into public.game_conflict_confirmations
        (encounter_id, match_number, game_number, side, player_id, auth_user_id, home_points, away_points, client_request_id)
      values
        (p_encounter_id, p_match_number, p_game_number, v_side, v_player, auth.uid(), p_home_points, p_away_points,
         p_client_request_id);
      perform public.reconcile_game(p_encounter_id, p_match_number, p_game_number);
      perform public.recompute_encounter(p_encounter_id);
    end if;
  end if;

  select * into v_state from public.reconciled_set_states
  where encounter_id = p_encounter_id and match_number = p_match_number and game_number = p_game_number;
  return jsonb_build_object(
    'duplicate', v_duplicate,
    'side', v_side,
    'status', v_state.status,
    'home_points', v_state.home_points,
    'away_points', v_state.away_points
  );
end;
$$;

-- Realtime: participants and organizers see team confirmations as they happen (RLS applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public'
                       and tablename = 'game_conflict_confirmations') then
    alter publication supabase_realtime add table public.game_conflict_confirmations;
  end if;
end;
$$;

revoke execute on function public.reconcile_game(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.confirm_game_resolution(uuid, uuid, integer, integer, integer, integer) from public, anon;
grant execute on function public.confirm_game_resolution(uuid, uuid, integer, integer, integer, integer) to authenticated;
