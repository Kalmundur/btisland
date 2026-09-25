-- ============================================================================
-- Borðtennis Live – production hardening
--
--  1. Column-level read access: the auth user id behind an anonymous device is never
--     readable through the API (confirmations, raw entries). Player ids stay readable
--     where RLS already allows the row.
--  2. Organizer bootstrap: grant/revoke functions callable only from the SQL editor /
--     service role – never from the app.
-- ============================================================================

-- 1. Hide auth_user_id columns --------------------------------------------------------
revoke select on public.result_confirmations from anon, authenticated;
grant select (id, encounter_id, side, player_id, result_hash, result_version, snapshot, created_at, invalidated_at)
  on public.result_confirmations to anon, authenticated;

revoke select on public.lineup_confirmations from anon, authenticated;
grant select (id, lineup_id, player_id, side, version, created_at)
  on public.lineup_confirmations to anon, authenticated;

revoke select on public.doubles_confirmations from anon, authenticated;
grant select (id, doubles_selection_id, player_id, side, version, created_at)
  on public.doubles_confirmations to anon, authenticated;

revoke select on public.set_entries from anon, authenticated;
grant select (id, encounter_id, match_number, game_number, side, home_points, away_points,
              submitted_by_player_id, client_entry_id, created_at, updated_at)
  on public.set_entries to anon, authenticated;

-- Tables only written through SECURITY DEFINER functions: no direct writes at all.
revoke insert, update, delete on public.set_entries, public.reconciled_set_states,
  public.result_confirmations, public.lineup_confirmations, public.doubles_confirmations,
  public.round_sessions, public.join_attempts, public.audit_log
  from anon, authenticated;
-- Players may leave a round they joined (RLS: own rows only).
grant delete on public.round_sessions to authenticated;

-- 2. Organizer bootstrap -----------------------------------------------------------------
-- Run in the Supabase SQL editor (as the project owner):
--   select public.grant_organizer('you@example.com');
create or replace function public.grant_organizer(p_email text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    raise exception 'No auth user with email %. Create the user first (Authentication → Users).', p_email;
  end if;
  insert into public.organizers (user_id) values (v_id) on conflict (user_id) do nothing;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'grant_organizer', 'organizers', v_id, jsonb_build_object('email', lower(trim(p_email))));
  return v_id;
end;
$$;

create or replace function public.revoke_organizer(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  delete from public.organizers where user_id = v_id;
  insert into public.audit_log (actor_user_id, action, entity_table, entity_id, details)
  values (auth.uid(), 'revoke_organizer', 'organizers', v_id, jsonb_build_object('email', lower(trim(p_email))));
end;
$$;

revoke execute on function public.grant_organizer(text) from public, anon, authenticated;
revoke execute on function public.revoke_organizer(text) from public, anon, authenticated;
