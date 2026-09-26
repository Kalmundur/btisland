-- ============================================================================
-- Doubles pairs need only ONE confirmation: the player who submits the pair.
-- Proposing (or re-proposing after an organizer unlock) locks the pair at once.
-- Singles lineups still need two different players (unchanged).
-- ============================================================================

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

  insert into public.doubles_selections (encounter_id, team_id, side, submitted_by, version, confirmed_count, locked_at)
  values (p_encounter_id, v_team_id, v_side, auth.uid(), 1, 1, now())
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by,
        submitted_at = now(),
        version = public.doubles_selections.version + 1,
        confirmed_count = 1,
        locked_at = now()
  returning * into v_sel;

  delete from public.doubles_players where doubles_selection_id = v_sel.id;
  insert into public.doubles_players (doubles_selection_id, player_id, position)
  values (v_sel.id, p_player1, 1), (v_sel.id, p_player2, 2);

  insert into public.doubles_confirmations (doubles_selection_id, auth_user_id, player_id, side, version)
  values (v_sel.id, auth.uid(), v_player, v_side, v_sel.version);

  -- Reveal both pairs simultaneously once both teams have submitted.
  if (select count(*) from public.doubles_selections where encounter_id = p_encounter_id and locked_at is not null) = 2 then
    update public.encounters set doubles_revealed_at = now()
    where id = p_encounter_id and doubles_revealed_at is null;
  end if;
  perform public.recompute_encounter(p_encounter_id);

  return jsonb_build_object('selection_id', v_sel.id, 'version', v_sel.version, 'confirmed_count', 1, 'locked', true);
end;
$$;

-- Kept for older clients and for pairs proposed before this migration: one confirmation locks.
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
         locked_at = case when v_count >= 1 then now() end
   where id = p_selection_id;

  if (select count(*) from public.doubles_selections where encounter_id = v_sel.encounter_id and locked_at is not null) = 2 then
    update public.encounters set doubles_revealed_at = now()
    where id = v_sel.encounter_id and doubles_revealed_at is null;
  end if;
  perform public.recompute_encounter(v_sel.encounter_id);

  return jsonb_build_object('version', v_sel.version, 'confirmed_count', v_count, 'locked', v_count >= 1);
end;
$$;

-- Lock pairs that were waiting for a second confirmation, then reveal/recompute affected encounters.
do $$
declare
  v_enc uuid;
begin
  for v_enc in
    update public.doubles_selections ds
       set locked_at = now()
      from public.encounters e
     where e.id = ds.encounter_id
       and e.status not in ('completed', 'cancelled', 'postponed')
       and ds.locked_at is null and ds.confirmed_count >= 1
    returning ds.encounter_id
  loop
    if (select count(*) from public.doubles_selections where encounter_id = v_enc and locked_at is not null) = 2 then
      update public.encounters set doubles_revealed_at = now()
      where id = v_enc and doubles_revealed_at is null;
    end if;
    perform public.recompute_encounter(v_enc);
  end loop;
end;
$$;
