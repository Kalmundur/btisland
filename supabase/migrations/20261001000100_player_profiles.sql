-- ============================================================================
-- Optional, player-supplied profile metadata (Leikhönd / Leikstíll / Áhersla).
--
-- Kept apart from the official register: names, clubs, registrations, results
-- and statistics stay canonical in their own tables. One row per official
-- player; a row with all-null fields means "asked and skipped".
--
-- Writes: only the player currently selected on the calling device
-- (current_player_id(), from player_device_profiles) – or an organizer.
-- Reads: public for public players (shown on player pages).
-- ============================================================================

create table public.player_profiles (
  player_id       uuid primary key references public.players (id) on delete cascade,
  playing_hand    text check (playing_hand in ('right', 'left')),
  -- 1 = strongly defensive … 5 = strongly offensive (null = unanswered)
  playing_style   smallint check (playing_style between 1 and 5),
  -- 1 = strongly backhand … 5 = strongly forehand (null = unanswered)
  stroke_emphasis smallint check (stroke_emphasis between 1 and 5),
  updated_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger player_profiles_touch before update on public.player_profiles
  for each row execute function public.touch_updated_at();
create trigger player_profiles_audit after insert or update or delete on public.player_profiles
  for each row execute function public.audit_row_change();

alter table public.player_profiles enable row level security;

create policy player_profiles_public_read on public.player_profiles for select using (
  exists (select 1 from public.players p where p.id = player_id and p.is_public)
  or player_id = public.current_player_id()
  or public.is_organizer()
);

create policy player_profiles_own_insert on public.player_profiles for insert to authenticated
  with check (player_id = public.current_player_id() or public.is_organizer());

create policy player_profiles_own_update on public.player_profiles for update to authenticated
  using (player_id = public.current_player_id() or public.is_organizer())
  with check (player_id = public.current_player_id() or public.is_organizer());

create policy player_profiles_organizer_delete on public.player_profiles for delete to authenticated
  using (public.is_organizer());

-- Anonymous (not signed-in) visitors may only read.
revoke insert, update, delete on public.player_profiles from anon;
