-- ============================================================================
-- Remove the optional player-supplied profile fields (Leikhönd / Leikstíll /
-- Áhersla) from v1. player_profiles was created only for that feature
-- (20261001000100); nothing references it, so dropping it touches no official
-- data: players, team registrations, encounters, scores, rankings and auth
-- sessions are unaffected. Past audit_log rows are kept as history.
-- Safe to run whether or not the table exists.
-- ============================================================================
drop table if exists public.player_profiles;
