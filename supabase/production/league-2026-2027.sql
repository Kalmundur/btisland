-- ============================================================================
-- PRODUCTION league data (no access codes). Apply ONCE, manually, to an empty
-- production database: SQL editor, or psql "$PROD_DB_URL" -f <this file>.
-- Generated from seed/leagueSeed.ts by npm run seed:generate – do not edit by hand.
-- ============================================================================
begin;

-- Season
insert into public.seasons (name, starts_on, ends_on, is_current) values ('2026–2027', '2026-09-01', '2027-05-31', true);

-- Division
insert into public.divisions (season_id, name, sort_order)
select s.id, '1. deild karla', 1 from public.seasons s where s.name = '2026–2027';

-- Clubs
insert into public.clubs (name, short_name) values
  ('BH', 'BH'),
  ('HK', 'HK'),
  ('KR', 'KR'),
  ('Víkingur', 'Víkingur');

-- Teams
insert into public.teams (club_id, name)
select c.id, v.name from (values
  ('BH-A', 'BH'),
  ('BH-B', 'BH'),
  ('HK-A', 'HK'),
  ('KR-A', 'KR'),
  ('KR-B', 'KR'),
  ('Víkingur-A', 'Víkingur')
) as v(name, club) join public.clubs c on c.short_name = v.club;

-- Teams entered into the division
insert into public.division_teams (division_id, team_id)
select d.id, t.id from public.teams t
cross join public.divisions d join public.seasons s on s.id = d.season_id
where s.name = '2026–2027' and d.name = '1. deild karla'
  and t.name in ('BH-A', 'BH-B', 'HK-A', 'KR-A', 'KR-B', 'Víkingur-A');

-- Players (belong to the club of their team) and their team registrations
create temporary table _seed_players (full_name text, team text) on commit drop;
insert into _seed_players (full_name, team) values
  ('Magnús Hjartarson', 'BH-A'),
  ('Alexandar Kotromanac', 'BH-A'),
  ('Zhao Liu', 'BH-A'),
  ('Matthías Sandholt', 'BH-A'),
  ('Kristján Ármann', 'BH-A'),
  ('Birgir Ívarsson', 'BH-A'),
  ('Magnús Úlfarsson', 'BH-A'),
  ('Thomas Charukevic', 'BH-B'),
  ('Alexander Ivanov', 'BH-B'),
  ('Sól Kristínardóttir Mixa', 'BH-B'),
  ('Noa Nilsson', 'BH-B'),
  ('Heiðar Sölvason', 'BH-B'),
  ('Jóhannes Urbancic Tómasson', 'BH-B'),
  ('Óskar Agnarsson', 'HK-A'),
  ('Björn Gunnarsson', 'HK-A'),
  ('Mariusz Rosinski', 'HK-A'),
  ('Darian Róbertsson Kinghorn', 'HK-A'),
  ('Sindri Sigurðsson', 'HK-A'),
  ('Luca Aquino', 'KR-A'),
  ('Norbert Bedö', 'KR-A'),
  ('Gestur Gunnarsson', 'KR-A'),
  ('Pétur Gunnarsson', 'KR-A'),
  ('Davíð Jónsson', 'KR-A'),
  ('Karl Claesson', 'KR-B'),
  ('Ellert Georgsson', 'KR-B'),
  ('Eiríkur Gunnarsson', 'KR-B'),
  ('Lúkas Ólason', 'KR-B'),
  ('Isak Alfredsson', 'Víkingur-A'),
  ('Stefán Birkisson', 'Víkingur-A'),
  ('Isak Edwardsson', 'Víkingur-A'),
  ('Daði Guðmundsson', 'Víkingur-A'),
  ('Benedikt Jóhannsson', 'Víkingur-A'),
  ('Hugo Nylen', 'Víkingur-A'),
  ('Viktor Pulgar', 'Víkingur-A'),
  ('Ingi Rodriquez', 'Víkingur-A'),
  ('Charlie Widing', 'Víkingur-A'),
  ('Anton Ólafsson', 'Víkingur-A');
insert into public.players (club_id, full_name)
select t.club_id, sp.full_name from _seed_players sp join public.teams t on t.name = sp.team;
insert into public.team_registrations (player_id, team_id, season_id, division_id)
select p.id, t.id, d.season_id, d.id
from _seed_players sp
join public.teams t on t.name = sp.team
join public.players p on p.full_name = sp.full_name and p.club_id = t.club_id
cross join public.divisions d join public.seasons s on s.id = d.season_id
where s.name = '2026–2027' and d.name = '1. deild karla';

-- Rounds (start time unknown -> null)
insert into public.rounds (division_id, number, round_date, start_time, venue)
select d.id, v.number, v.round_date::date, null, v.venue from (values
  (1, '2026-09-19', 'Íþróttahús Snælandsskóla, Kópavogi'),
  (2, '2026-09-19', 'Íþróttahús Snælandsskóla, Kópavogi'),
  (3, '2026-10-17', 'Íþróttahúsið við Strandgötu, Hafnarfirði'),
  (4, '2026-10-17', 'Íþróttahúsið við Strandgötu, Hafnarfirði'),
  (5, '2026-11-22', 'Íþróttahús Hagaskóla, Reykjavík'),
  (6, '2026-11-22', 'Íþróttahús Hagaskóla, Reykjavík'),
  (7, '2027-01-09', 'Íþróttahús Hagaskóla, Reykjavík'),
  (8, '2027-01-09', 'Íþróttahús Hagaskóla, Reykjavík'),
  (9, '2027-03-06', 'TBR-húsið, Reykjavík'),
  (10, '2027-03-06', 'TBR-húsið, Reykjavík')
) as v(number, round_date, venue)
cross join public.divisions d join public.seasons s on s.id = d.season_id
where s.name = '2026–2027' and d.name = '1. deild karla';

-- Encounters (home team = "Lið 1" = A/B/C, away team = X/Y/Z)
insert into public.encounters (round_id, home_team_id, away_team_id)
select r.id, ht.id, at.id from (values
  (1, 'KR-A', 'KR-B'),
  (1, 'BH-B', 'BH-A'),
  (1, 'Víkingur-A', 'HK-A'),
  (2, 'Víkingur-A', 'BH-B'),
  (2, 'BH-A', 'KR-A'),
  (2, 'HK-A', 'KR-B'),
  (3, 'KR-A', 'Víkingur-A'),
  (3, 'KR-B', 'BH-A'),
  (3, 'BH-B', 'HK-A'),
  (4, 'BH-B', 'KR-A'),
  (4, 'Víkingur-A', 'KR-B'),
  (4, 'HK-A', 'BH-A'),
  (5, 'BH-A', 'Víkingur-A'),
  (5, 'KR-B', 'BH-B'),
  (5, 'KR-A', 'HK-A'),
  (6, 'HK-A', 'Víkingur-A'),
  (6, 'BH-A', 'BH-B'),
  (6, 'KR-B', 'KR-A'),
  (7, 'BH-B', 'Víkingur-A'),
  (7, 'KR-A', 'BH-A'),
  (7, 'KR-B', 'HK-A'),
  (8, 'HK-A', 'BH-B'),
  (8, 'Víkingur-A', 'KR-A'),
  (8, 'BH-A', 'KR-B'),
  (9, 'KR-B', 'Víkingur-A'),
  (9, 'KR-A', 'BH-B'),
  (9, 'BH-A', 'HK-A'),
  (10, 'HK-A', 'KR-A'),
  (10, 'BH-B', 'KR-B'),
  (10, 'Víkingur-A', 'BH-A')
) as v(round_number, home, away)
join public.rounds r on r.number = v.round_number
join public.divisions d on d.id = r.division_id and d.name = '1. deild karla'
join public.seasons s on s.id = d.season_id and s.name = '2026–2027'
join public.teams ht on ht.name = v.home
join public.teams at on at.name = v.away;

commit;
