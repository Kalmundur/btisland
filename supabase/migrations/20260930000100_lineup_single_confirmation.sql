-- ============================================================================
-- Singles lineups need only ONE confirmation: the player who submits the lineup.
-- Proposing (or re-proposing after an organizer unlock) locks the lineup at once.
-- Lineups stay hidden from the opponent until both teams have submitted.
-- A team may still change its submitted lineup until the other team has submitted too
-- (i.e. until the lineups are revealed); after that only an organizer can unlock it.
-- ============================================================================

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
  -- Both teams have submitted (lineups revealed): only an organizer unlock reopens it.
  if v_enc.lineups_revealed_at is not null then
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

  insert into public.lineups (encounter_id, team_id, side, submitted_by, version, confirmed_count, locked_at)
  values (p_encounter_id, v_team_id, v_side, auth.uid(), 1, 1, now())
  on conflict (encounter_id, side) do update
    set submitted_by = excluded.submitted_by,
        submitted_at = now(),
        version = public.lineups.version + 1,
        confirmed_count = 1,
        locked_at = now()
  returning * into v_lineup;

  delete from public.lineup_slots where lineup_id = v_lineup.id;
  insert into public.lineup_slots (lineup_id, slot, player_id)
  select v_lineup.id, key, value::uuid from jsonb_each_text(p_slots);

  -- The proposer's confirmation is the only one needed.
  insert into public.lineup_confirmations (lineup_id, auth_user_id, player_id, side, version)
  values (v_lineup.id, auth.uid(), v_player, v_side, v_lineup.version);

  -- Reveal both lineups simultaneously once both teams have submitted.
  if (select count(*) from public.lineups where encounter_id = p_encounter_id and locked_at is not null) = 2 then
    update public.encounters set lineups_revealed_at = now()
    where id = p_encounter_id and lineups_revealed_at is null;
  end if;
  perform public.recompute_encounter(p_encounter_id);

  return jsonb_build_object('lineup_id', v_lineup.id, 'version', v_lineup.version, 'confirmed_count', 1, 'locked', true);
end;
$$;

-- Kept for older clients and for lineups proposed before this migration: one confirmation locks.
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
         locked_at = case when v_count >= 1 then now() end
   where id = p_lineup_id;

  -- Reveal both lineups simultaneously once both teams are locked.
  if (select count(*) from public.lineups where encounter_id = v_lineup.encounter_id and locked_at is not null) = 2 then
    update public.encounters set lineups_revealed_at = now()
    where id = v_lineup.encounter_id and lineups_revealed_at is null;
  end if;
  perform public.recompute_encounter(v_lineup.encounter_id);

  return jsonb_build_object('version', v_lineup.version, 'confirmed_count', v_count, 'locked', v_count >= 1);
end;
$$;

-- Lock lineups that were waiting for a second confirmation, then reveal/recompute affected encounters.
do $$
declare
  v_enc uuid;
begin
  for v_enc in
    update public.lineups l
       set locked_at = now()
      from public.encounters e
     where e.id = l.encounter_id
       and e.status not in ('completed', 'cancelled', 'postponed')
       and l.locked_at is null and l.confirmed_count >= 1
    returning l.encounter_id
  loop
    if (select count(*) from public.lineups where encounter_id = v_enc and locked_at is not null) = 2 then
      update public.encounters set lineups_revealed_at = now()
      where id = v_enc and lineups_revealed_at is null;
    end if;
    perform public.recompute_encounter(v_enc);
  end loop;
end;
$$;
