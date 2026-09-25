-- ============================================================================
-- Borðtennis Live – access helpers and Row Level Security
--
-- Roles:
--   anon           : not signed in at all (public read-only views)
--   authenticated  : anonymous player devices AND organizers (email/password)
--   organizer      : authenticated user with a row in public.organizers
-- ============================================================================

-- Helpers ------------------------------------------------------------------------
create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organizers o where o.user_id = auth.uid());
$$;

-- The side ('home'/'away') the current user has joined for an encounter, or null.
create or replace function public.session_side(p_encounter_id uuid)
returns public.team_side language sql stable security definer set search_path = public as $$
  select case
           when rs.team_id = e.home_team_id then 'home'::public.team_side
           when rs.team_id = e.away_team_id then 'away'::public.team_side
         end
  from public.round_sessions rs
  join public.encounters e on e.id = rs.encounter_id
  where rs.auth_user_id = auth.uid() and rs.encounter_id = p_encounter_id
  limit 1;
$$;

-- Enable RLS everywhere ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizers', 'clubs', 'seasons', 'divisions', 'teams', 'division_teams', 'players',
    'team_registrations', 'rounds', 'round_access_codes', 'encounters', 'player_device_profiles',
    'round_sessions', 'join_attempts', 'lineups', 'lineup_slots', 'lineup_confirmations',
    'doubles_selections', 'doubles_players', 'doubles_confirmations', 'encounter_games',
    'set_entries', 'reconciled_set_states', 'result_confirmations', 'audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Organizer full access on admin-managed tables --------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'clubs', 'seasons', 'divisions', 'teams', 'division_teams', 'players', 'team_registrations',
    'rounds', 'round_access_codes', 'encounters', 'encounter_games', 'lineups', 'lineup_slots',
    'doubles_selections', 'doubles_players', 'reconciled_set_states'
  ] loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_organizer()) with check (public.is_organizer())',
      t || '_organizer_all', t
    );
  end loop;
end;
$$;

-- Organizers ---------------------------------------------------------------------------
-- Membership is managed with SQL by the project owner (see README). Users can check themselves.
create policy organizers_select_self on public.organizers
  for select to authenticated using (user_id = auth.uid() or public.is_organizer());

-- Public league data ---------------------------------------------------------------------
create policy clubs_public_read on public.clubs for select using (is_public);
create policy teams_public_read on public.teams for select using (is_public);
create policy players_public_read on public.players for select using (is_public);
create policy seasons_public_read on public.seasons for select using (true);
create policy divisions_public_read on public.divisions for select using (true);
create policy division_teams_public_read on public.division_teams for select using (true);
create policy team_registrations_public_read on public.team_registrations for select using (true);
create policy rounds_public_read on public.rounds for select using (true);
create policy encounters_public_read on public.encounters for select using (true);
create policy encounter_games_public_read on public.encounter_games for select using (true);
create policy result_confirmations_public_read on public.result_confirmations for select using (true);

-- round_access_codes: organizer only (policy created above). No public policy on purpose.

-- Player device profile: own row only ------------------------------------------------------
create policy player_device_profiles_own_select on public.player_device_profiles
  for select to authenticated using (auth_user_id = auth.uid() or public.is_organizer());
create policy player_device_profiles_own_insert on public.player_device_profiles
  for insert to authenticated with check (auth_user_id = auth.uid());
create policy player_device_profiles_own_update on public.player_device_profiles
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy player_device_profiles_own_delete on public.player_device_profiles
  for delete to authenticated using (auth_user_id = auth.uid());

-- Round sessions: created only by join_round(); users may read and leave their own ------------
create policy round_sessions_own_select on public.round_sessions
  for select to authenticated using (auth_user_id = auth.uid() or public.is_organizer());
create policy round_sessions_own_delete on public.round_sessions
  for delete to authenticated using (auth_user_id = auth.uid() or public.is_organizer());

-- Lineups: public after reveal; before reveal only the submitting team's joined devices ----------
create policy lineups_read on public.lineups for select using (
  exists (select 1 from public.encounters e where e.id = encounter_id and e.lineups_revealed_at is not null)
  or public.session_side(encounter_id) = side
);
-- Visibility of children follows the parent's policy (the subquery is itself subject to RLS).
create policy lineup_slots_read on public.lineup_slots for select using (
  exists (select 1 from public.lineups l where l.id = lineup_id)
);
create policy lineup_confirmations_read on public.lineup_confirmations for select using (
  exists (select 1 from public.lineups l where l.id = lineup_id)
);

create policy doubles_selections_read on public.doubles_selections for select using (
  exists (select 1 from public.encounters e where e.id = encounter_id and e.doubles_revealed_at is not null)
  or public.session_side(encounter_id) = side
);
create policy doubles_players_read on public.doubles_players for select using (
  exists (select 1 from public.doubles_selections d where d.id = doubles_selection_id)
);
create policy doubles_confirmations_read on public.doubles_confirmations for select using (
  exists (select 1 from public.doubles_selections d where d.id = doubles_selection_id)
);

-- Scores -------------------------------------------------------------------------------------
-- Raw entries: only your own side's entries (conflict details stay private) + organizers.
create policy set_entries_read on public.set_entries for select to authenticated using (
  public.session_side(encounter_id) = side or public.is_organizer()
);
-- Reconciled state: agreed sets are public; participants also see pending/conflict flags.
create policy reconciled_set_states_read on public.reconciled_set_states for select using (
  status = 'agreed' or public.session_side(encounter_id) is not null
);

-- Audit log: organizers only -------------------------------------------------------------------
create policy audit_log_organizer_read on public.audit_log
  for select to authenticated using (public.is_organizer());

-- join_attempts: no policies -> inaccessible through the API.

-- Realtime --------------------------------------------------------------------------------------
-- postgres_changes respects RLS, so hidden rows are not broadcast.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.encounters,
      public.lineups,
      public.doubles_selections,
      public.encounter_games,
      public.reconciled_set_states,
      public.result_confirmations;
  end if;
end;
$$;
