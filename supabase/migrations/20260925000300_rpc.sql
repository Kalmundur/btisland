-- ============================================================================
-- Borðtennis Live – RPC functions
-- All player write paths go through these SECURITY DEFINER functions, which
-- validate the caller's round session before touching any table.
-- ============================================================================

-- Table tennis set rule: first to 11, win by 2 (deuce continues past 10–10).
create or replace function public.is_valid_set_score(p_a integer, p_b integer)
returns boolean language sql immutable as $$
  select p_a >= 0 and p_b >= 0 and (
    (greatest(p_a, p_b) = 11 and least(p_a, p_b) <= 9)
    or (greatest(p_a, p_b) > 11 and abs(p_a - p_b) = 2)
  );
$$;

create or replace function public.current_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from public.player_device_profiles where auth_user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- join_round(code [, encounter_id])
-- Returns jsonb: { status: 'joined', round_id, encounter_id, team_id }
--              | { status: 'choose', round_id, choices: [{ encounter_id, team_id }] }
--              | { status: 'invalid_code' | 'no_profile' | 'not_registered'
--                         | 'no_encounter' | 'rate_limited' | 'not_authenticated' }
-- ---------------------------------------------------------------------------
create or replace function public.join_round(p_code text, p_encounter_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid       uuid := auth.uid();
  v_code      public.round_access_codes;
  v_round     public.rounds;
  v_division  public.divisions;
  v_player_id uuid;
  v_failed    integer;
  v_teams     uuid[];
  v_count     integer;
  v_choices   jsonb;
  v_enc_id    uuid;
  v_team_id   uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_authenticated');
  end if;

  select count(*) into v_failed
  from public.join_attempts
  where auth_user_id = v_uid and not succeeded and attempted_at > now() - interval '15 minutes';
  if v_failed >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into v_code from public.round_access_codes
  where code = trim(coalesce(p_code, '')) and is_active;
  if not found then
    insert into public.join_attempts (auth_user_id, succeeded) values (v_uid, false);
    return jsonb_build_object('status', 'invalid_code');
  end if;

  select * into v_round from public.rounds where id = v_code.round_id;
  select * into v_division from public.divisions where id = v_round.division_id;

  v_player_id := public.current_player_id();
  if v_player_id is null then
    return jsonb_build_object('status', 'no_profile');
  end if;

  select array_agg(tr.team_id) into v_teams
  from public.team_registrations tr
  where tr.player_id = v_player_id
    and tr.is_active
    and tr.season_id = v_division.season_id
    and tr.division_id = v_division.id;
  if v_teams is null then
    return jsonb_build_object('status', 'not_registered', 'round_id', v_round.id);
  end if;

  select count(*),
         jsonb_agg(jsonb_build_object('encounter_id', c.encounter_id, 'team_id', c.team_id) order by c.encounter_id)
    into v_count, v_choices
  from (
    select e.id as encounter_id,
           case when e.home_team_id = any (v_teams) then e.home_team_id else e.away_team_id end as team_id
    from public.encounters e
    where e.round_id = v_round.id
      and e.status <> 'cancelled'
      and (e.home_team_id = any (v_teams) or e.away_team_id = any (v_teams))
      and (p_encounter_id is null or e.id = p_encounter_id)
  ) c;

  if v_count = 0 then
    return jsonb_build_object('status', 'no_encounter', 'round_id', v_round.id);
  elsif v_count > 1 then
    return jsonb_build_object('status', 'choose', 'round_id', v_round.id, 'choices', v_choices);
  end if;

  v_enc_id := (v_choices -> 0 ->> 'encounter_id')::uuid;
  v_team_id := (v_choices -> 0 ->> 'team_id')::uuid;

  insert into public.round_sessions (auth_user_id, round_id, encounter_id, team_id, player_id, access_code_id)
  values (v_uid, v_round.id, v_enc_id, v_team_id, v_player_id, v_code.id)
  on conflict (auth_user_id, round_id) do update
    set encounter_id = excluded.encounter_id,
        team_id = excluded.team_id,
        player_id = excluded.player_id,
        access_code_id = excluded.access_code_id,
        joined_at = now();

  insert into public.join_attempts (auth_user_id, succeeded) values (v_uid, true);

  return jsonb_build_object('status', 'joined', 'round_id', v_round.id, 'encounter_id', v_enc_id, 'team_id', v_team_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizer: create/regenerate the round code. Old code is deactivated; existing
-- round_sessions are untouched, so already-joined devices stay connected.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_round_code(p_round_id uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.rounds where id = p_round_id) then
    raise exception 'round_not_found' using errcode = 'P0002';
  end if;

  update public.round_access_codes
     set is_active = false, deactivated_at = now()
   where round_id = p_round_id and is_active;

  loop
    v_code := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    exit when not exists (select 1 from public.round_access_codes where code = v_code and is_active);
  end loop;

  insert into public.round_access_codes (round_id, code, is_active, created_by)
  values (p_round_id, v_code, true, auth.uid());

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lineups
-- p_slots: {"A": "<player uuid>", "B": "...", "C": "..."} (home) or X/Y/Z (away)
-- Both lineups submitted -> revealed to everybody.
-- ---------------------------------------------------------------------------
create or replace function public.submit_lineup(p_encounter_id uuid, p_slots jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_side      public.team_side := public.session_side(p_encounter_id);
  v_enc       public.encounters;
  v_division  public.divisions;
  v_team_id   uuid;
  v_letters   text[];
  v_letter    text;
  v_player_id uuid;
  v_lineup_id uuid;
begin
  if v_side is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  select * into v_enc from public.encounters where id = p_encounter_id for update;
  if v_enc.lineups_revealed_at is not null or v_enc.status in ('completed', 'cancelled') then
    raise exception 'lineups_locked';
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

  insert into public.lineups (encounter_id, team_id, side, submitted_by)
  values (p_encounter_id, v_team_id, v_side, auth.uid())
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by, submitted_at = now()
  returning id into v_lineup_id;

  delete from public.lineup_slots where lineup_id = v_lineup_id;
  delete from public.lineup_confirmations where lineup_id = v_lineup_id;
  insert into public.lineup_slots (lineup_id, slot, player_id)
  select v_lineup_id, key, value::uuid from jsonb_each_text(p_slots);

  if (select count(*) from public.lineups where encounter_id = p_encounter_id) = 2 then
    update public.encounters
       set lineups_revealed_at = now(),
           status = case when status = 'scheduled' then 'lineups'::public.encounter_status else status end
     where id = p_encounter_id;
  end if;

  return v_lineup_id;
end;
$$;

create or replace function public.confirm_lineup(p_lineup_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_lineup public.lineups;
  v_side   public.team_side;
  v_rev    timestamptz;
begin
  select * into v_lineup from public.lineups where id = p_lineup_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_side := public.session_side(v_lineup.encounter_id);
  select lineups_revealed_at into v_rev from public.encounters where id = v_lineup.encounter_id;
  if v_side is null or (v_side <> v_lineup.side and v_rev is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.lineup_confirmations (lineup_id, auth_user_id, player_id, side)
  values (p_lineup_id, auth.uid(), public.current_player_id(), v_side)
  on conflict (lineup_id, auth_user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Doubles
-- ---------------------------------------------------------------------------
create or replace function public.submit_doubles(p_encounter_id uuid, p_player1 uuid, p_player2 uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_side     public.team_side := public.session_side(p_encounter_id);
  v_enc      public.encounters;
  v_division public.divisions;
  v_team_id  uuid;
  v_sel_id   uuid;
begin
  if v_side is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  if p_player1 is null or p_player2 is null or p_player1 = p_player2 then
    raise exception 'invalid_doubles';
  end if;
  select * into v_enc from public.encounters where id = p_encounter_id for update;
  if v_enc.doubles_revealed_at is not null or v_enc.status in ('completed', 'cancelled') then
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

  insert into public.doubles_selections (encounter_id, team_id, side, submitted_by)
  values (p_encounter_id, v_team_id, v_side, auth.uid())
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by, submitted_at = now()
  returning id into v_sel_id;

  delete from public.doubles_players where doubles_selection_id = v_sel_id;
  delete from public.doubles_confirmations where doubles_selection_id = v_sel_id;
  insert into public.doubles_players (doubles_selection_id, player_id, position)
  values (v_sel_id, p_player1, 1), (v_sel_id, p_player2, 2);

  if (select count(*) from public.doubles_selections where encounter_id = p_encounter_id) = 2 then
    update public.encounters set doubles_revealed_at = now() where id = p_encounter_id;
  end if;

  return v_sel_id;
end;
$$;

create or replace function public.confirm_doubles(p_selection_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_sel  public.doubles_selections;
  v_side public.team_side;
  v_rev  timestamptz;
begin
  select * into v_sel from public.doubles_selections where id = p_selection_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  v_side := public.session_side(v_sel.encounter_id);
  select doubles_revealed_at into v_rev from public.encounters where id = v_sel.encounter_id;
  if v_side is null or (v_side <> v_sel.side and v_rev is null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.doubles_confirmations (doubles_selection_id, auth_user_id, player_id, side)
  values (p_selection_id, auth.uid(), public.current_player_id(), v_side)
  on conflict (doubles_selection_id, auth_user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Score entry: each side enters independently; the reconciled state is public
-- only when both sides agree.
-- ---------------------------------------------------------------------------
create or replace function public.submit_set_entry(
  p_encounter_id uuid,
  p_game_number  integer,
  p_set_number   integer,
  p_home_points  integer,
  p_away_points  integer
)
returns public.set_state_status language plpgsql security definer set search_path = public as $$
declare
  v_side   public.team_side := public.session_side(p_encounter_id);
  v_status public.encounter_status;
  v_home   public.set_entries;
  v_away   public.set_entries;
  v_state  public.set_state_status;
begin
  if v_side is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  select status into v_status from public.encounters where id = p_encounter_id for update;
  if v_status in ('completed', 'cancelled') then
    raise exception 'encounter_closed';
  end if;
  if not public.is_valid_set_score(p_home_points, p_away_points) then
    raise exception 'invalid_set_score';
  end if;

  insert into public.set_entries (encounter_id, game_number, set_number, side, home_points, away_points, entered_by, player_id)
  values (p_encounter_id, p_game_number, p_set_number, v_side, p_home_points, p_away_points, auth.uid(), public.current_player_id())
  on conflict (encounter_id, game_number, set_number, side) do update
    set home_points = excluded.home_points,
        away_points = excluded.away_points,
        entered_by = excluded.entered_by,
        player_id = excluded.player_id;

  select * into v_home from public.set_entries
  where encounter_id = p_encounter_id and game_number = p_game_number and set_number = p_set_number and side = 'home';
  select * into v_away from public.set_entries
  where encounter_id = p_encounter_id and game_number = p_game_number and set_number = p_set_number and side = 'away';

  v_state := case
    when v_home.id is null or v_away.id is null then 'pending'
    when v_home.home_points = v_away.home_points and v_home.away_points = v_away.away_points then 'agreed'
    else 'conflict'
  end;

  insert into public.reconciled_set_states (encounter_id, game_number, set_number, status, home_points, away_points, updated_at)
  values (
    p_encounter_id, p_game_number, p_set_number, v_state,
    case when v_state = 'agreed' then v_home.home_points end,
    case when v_state = 'agreed' then v_home.away_points end,
    now()
  )
  on conflict (encounter_id, game_number, set_number) do update
    set status = excluded.status,
        home_points = excluded.home_points,
        away_points = excluded.away_points,
        updated_at = now();

  if v_status in ('scheduled', 'lineups') then
    update public.encounters set status = 'in_progress' where id = p_encounter_id;
  end if;

  return v_state;
end;
$$;

-- ---------------------------------------------------------------------------
-- Result confirmation: when both sides have confirmed, the encounter is completed
-- and the score is derived from the decided games.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_result(p_encounter_id uuid)
returns public.encounter_status language plpgsql security definer set search_path = public as $$
declare
  v_side   public.team_side := public.session_side(p_encounter_id);
  v_status public.encounter_status;
begin
  if v_side is null then
    raise exception 'not_in_encounter' using errcode = '42501';
  end if;
  select status into v_status from public.encounters where id = p_encounter_id for update;
  if v_status in ('completed', 'cancelled') then
    return v_status;
  end if;

  insert into public.result_confirmations (encounter_id, side, auth_user_id, player_id)
  values (p_encounter_id, v_side, auth.uid(), public.current_player_id())
  on conflict (encounter_id, auth_user_id) do nothing;

  if (select count(distinct side) from public.result_confirmations where encounter_id = p_encounter_id) = 2 then
    update public.encounters e
       set status = 'completed',
           home_score = (select count(*) from public.encounter_games g where g.encounter_id = e.id and g.winner = 'home'),
           away_score = (select count(*) from public.encounter_games g where g.encounter_id = e.id and g.winner = 'away')
     where e.id = p_encounter_id
    returning status into v_status;
  else
    update public.encounters set status = 'awaiting_confirmation' where id = p_encounter_id
    returning status into v_status;
  end if;

  return v_status;
end;
$$;

-- Execute permissions ---------------------------------------------------------------
-- Functions are executable by PUBLIC by default; restrict player/organizer RPCs to signed-in users.
revoke execute on function public.join_round(text, uuid) from public, anon;
revoke execute on function public.regenerate_round_code(uuid) from public, anon;
revoke execute on function public.submit_lineup(uuid, jsonb) from public, anon;
revoke execute on function public.confirm_lineup(uuid) from public, anon;
revoke execute on function public.submit_doubles(uuid, uuid, uuid) from public, anon;
revoke execute on function public.confirm_doubles(uuid) from public, anon;
revoke execute on function public.submit_set_entry(uuid, integer, integer, integer, integer) from public, anon;
revoke execute on function public.confirm_result(uuid) from public, anon;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

grant execute on function public.join_round(text, uuid) to authenticated;
grant execute on function public.regenerate_round_code(uuid) to authenticated;
grant execute on function public.submit_lineup(uuid, jsonb) to authenticated;
grant execute on function public.confirm_lineup(uuid) to authenticated;
grant execute on function public.submit_doubles(uuid, uuid, uuid) to authenticated;
grant execute on function public.confirm_doubles(uuid) to authenticated;
grant execute on function public.submit_set_entry(uuid, integer, integer, integer, integer) to authenticated;
grant execute on function public.confirm_result(uuid) to authenticated;
