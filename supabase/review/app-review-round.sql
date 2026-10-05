-- ============================================================================
-- App Store / Google Play review: a separate test round, isolated from the league.
--
-- Creates (once) in the CURRENT season:
--   club "Prófun", division "Prófun – app-yfirferð" (sort_order 99, so the public
--   Dagskrá/Staða keep showing the real division), teams Prófun-A and Prófun-B with
--   players Prófari A1–A3 / B1–B3, round 1 with ONE encounter Prófun-A – Prófun-B,
--   and round code 505050.
--
-- Every run also RESETS that test encounter to a fresh state and pre-submits the away
-- team's lineup and doubles pair, so a single reviewer (on Prófun-A) can go all the
-- way: lineup → reveal → games → doubles → result confirmation (their side).
--
-- Re-run before each review. Never touches the real division, its players or results.
-- Run in the Supabase SQL Editor as the project owner.
-- ============================================================================
begin;

do $$
declare
  v_season uuid;
  v_club   uuid;
  v_div    uuid;
  v_round  uuid;
  v_home   uuid;
  v_away   uuid;
  v_enc    uuid;
  v_id     uuid;
  v_team   uuid;
  v_name   text;
  v_tname  text;
  v_p      uuid[];
  i        integer;
begin
  select id into v_season from public.seasons where is_current;
  if v_season is null then
    raise exception 'No current season';
  end if;

  -- Club and division --------------------------------------------------------------
  select id into v_club from public.clubs where name = 'Prófun';
  if v_club is null then
    insert into public.clubs (name, short_name) values ('Prófun', 'PRÓF') returning id into v_club;
  end if;

  select id into v_div from public.divisions where season_id = v_season and name = 'Prófun – app-yfirferð';
  if v_div is null then
    insert into public.divisions (season_id, name, sort_order)
    values (v_season, 'Prófun – app-yfirferð', 99) returning id into v_div;
  end if;

  -- Teams and players (3 each: a full A/B/C or X/Y/Z lineup) -----------------------
  foreach v_tname in array array['Prófun-A', 'Prófun-B'] loop
    select id into v_team from public.teams where name = v_tname;
    if v_team is null then
      insert into public.teams (club_id, name) values (v_club, v_tname) returning id into v_team;
    end if;
    insert into public.division_teams (division_id, team_id) values (v_div, v_team) on conflict do nothing;
    if v_tname = 'Prófun-A' then v_home := v_team; else v_away := v_team; end if;

    for i in 1..3 loop
      v_name := 'Prófari ' || right(v_tname, 1) || i;
      select id into v_id from public.players where full_name = v_name and club_id = v_club;
      if v_id is null then
        insert into public.players (club_id, full_name) values (v_club, v_name) returning id into v_id;
      end if;
      insert into public.team_registrations (player_id, team_id, season_id, division_id)
      values (v_id, v_team, v_season, v_div)
      on conflict (player_id, season_id, division_id) do nothing;
    end loop;
  end loop;

  -- Round, encounter and code -------------------------------------------------------
  select id into v_round from public.rounds where division_id = v_div and number = 1;
  if v_round is null then
    insert into public.rounds (division_id, number, round_date, start_time, venue)
    values (v_div, 1, '2099-12-31', null, 'Prófunarumferð – ekki raunverulegur leikur')
    returning id into v_round;
  end if;

  select id into v_enc from public.encounters where round_id = v_round;
  if v_enc is null then
    insert into public.encounters (round_id, home_team_id, away_team_id)
    values (v_round, v_home, v_away) returning id into v_enc;
  end if;

  if not exists (select 1 from public.round_access_codes where round_id = v_round and is_active) then
    insert into public.round_access_codes (round_id, code, is_active) values (v_round, '505050', true);
  end if;

  -- Reset the test encounter ----------------------------------------------------------
  delete from public.game_corrections      where encounter_id = v_enc;
  delete from public.set_entries           where encounter_id = v_enc;
  delete from public.result_confirmations  where encounter_id = v_enc;
  delete from public.lineups               where encounter_id = v_enc;
  delete from public.doubles_selections    where encounter_id = v_enc;
  delete from public.reconciled_set_states where encounter_id = v_enc;
  delete from public.round_sessions        where encounter_id = v_enc;
  update public.encounters
     set status = 'scheduled', lineups_revealed_at = null, doubles_revealed_at = null
   where id = v_enc;

  -- Pre-submit the away team (Prófun-B): lineup X/Y/Z and doubles pair, both locked.
  -- They stay hidden until the reviewer submits Prófun-A's, then both are revealed.
  select array_agg(p.id order by p.full_name) into v_p
  from public.players p where p.club_id = v_club and p.full_name like 'Prófari B%';

  insert into public.lineups (encounter_id, team_id, side, version, confirmed_count, locked_at)
  values (v_enc, v_away, 'away', 1, 1, now()) returning id into v_id;
  insert into public.lineup_slots (lineup_id, slot, player_id)
  values (v_id, 'X', v_p[1]), (v_id, 'Y', v_p[2]), (v_id, 'Z', v_p[3]);

  insert into public.doubles_selections (encounter_id, team_id, side, version, confirmed_count, locked_at)
  values (v_enc, v_away, 'away', 1, 1, now()) returning id into v_id;
  insert into public.doubles_players (doubles_selection_id, player_id, position)
  values (v_id, v_p[1], 1), (v_id, v_p[2], 2);

  perform public.recompute_encounter(v_enc);
end;
$$;

-- What a reviewer needs ---------------------------------------------------------------
select d.name as division, r.number as round, c.code as round_code,
       h.name as home, a.name as away, e.status
from public.encounters e
join public.rounds r on r.id = e.round_id
join public.divisions d on d.id = r.division_id
join public.teams h on h.id = e.home_team_id
join public.teams a on a.id = e.away_team_id
join public.round_access_codes c on c.round_id = r.id and c.is_active
where d.name = 'Prófun – app-yfirferð';

commit;
