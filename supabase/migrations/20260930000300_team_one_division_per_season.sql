-- ============================================================================
-- A team plays in at most ONE division per season, and stays in it once it has
-- encounters there.
--
-- - division_teams gets season_id (filled from the division by a trigger, so callers
--   keep inserting just division_id + team_id) and unique (team_id, season_id).
-- - A team cannot be removed from (or moved out of) a division where it already has
--   encounters. Deleting the whole division or team still cascades as before.
-- - admin_create_team creates a team and enters it into its division in one step.
-- ============================================================================

alter table public.division_teams add column season_id uuid;

update public.division_teams dt
   set season_id = d.season_id
  from public.divisions d
 where d.id = dt.division_id;

alter table public.division_teams alter column season_id set not null;

alter table public.division_teams
  add constraint division_teams_division_season_fkey
    foreign key (division_id, season_id) references public.divisions (id, season_id) on delete cascade,
  add constraint division_teams_one_division_per_season unique (team_id, season_id);

create or replace function public.guard_division_teams()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- Leaving a division (or moving to another) is refused once the team has encounters in
    -- it. Cascades from deleting the division or the team itself are not blocked: by then
    -- the parent row is already gone.
    if (tg_op = 'DELETE' or new.division_id <> old.division_id or new.team_id <> old.team_id)
       and exists (select 1 from public.divisions where id = old.division_id)
       and exists (select 1 from public.teams where id = old.team_id)
       and exists (
         select 1 from public.encounters e join public.rounds r on r.id = e.round_id
          where r.division_id = old.division_id and old.team_id in (e.home_team_id, e.away_team_id)
       ) then
      raise exception 'team_has_encounters';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
  end if;

  select season_id into new.season_id from public.divisions where id = new.division_id;
  if exists (
    select 1 from public.division_teams
     where team_id = new.team_id and season_id = new.season_id and division_id <> new.division_id
       and not (tg_op = 'UPDATE' and division_id = old.division_id and team_id = old.team_id)
  ) then
    raise exception 'team_already_in_season';
  end if;
  return new;
end;
$$;

create trigger division_teams_guard before insert or update or delete on public.division_teams
  for each row execute function public.guard_division_teams();

-- Create a team and enter it into its division atomically (the division is required).
create or replace function public.admin_create_team(
  p_name text,
  p_club_id uuid,
  p_division_id uuid,
  p_is_active boolean default true,
  p_is_public boolean default true
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_organizer() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_division_id is null then
    raise exception 'division_required';
  end if;
  insert into public.teams (name, club_id, is_active, is_public)
  values (trim(p_name), p_club_id, coalesce(p_is_active, true), coalesce(p_is_public, true))
  returning id into v_id;
  insert into public.division_teams (division_id, team_id) values (p_division_id, v_id);
  return v_id;
end;
$$;

revoke execute on function public.admin_create_team(text, uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_create_team(text, uuid, uuid, boolean, boolean) to authenticated;
