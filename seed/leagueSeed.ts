/**
 * Source of truth for the development/initial seed data.
 * `npm run seed:generate` turns this into supabase/seed.sql.
 * Keep this file free of imports so Node can run the generator with native type stripping.
 */

export interface SeedTeam {
  name: string;
  club: string;
  players: string[];
}

export interface SeedRound {
  number: number;
  date: string; // YYYY-MM-DD
  venue: string;
  /** DEVELOPMENT SEED CODE – regenerate in the admin portal before real use. */
  devAccessCode: string;
  /** [home, away] – "Lið 1" in imported schedules is the home team. */
  encounters: Array<[string, string]>;
}

export const SEED_SEASON = { name: '2026–2027', startsOn: '2026-09-01', endsOn: '2027-05-31' };
export const SEED_DIVISION = { name: '1. deild karla', sortOrder: 1 };

export const SEED_CLUBS = ['BH', 'HK', 'KR', 'Víkingur'];

export const SEED_TEAMS: SeedTeam[] = [
  {
    name: 'BH-A',
    club: 'BH',
    players: [
      'Magnús Hjartarson',
      'Alexandar Kotromanac',
      'Zhao Liu',
      'Matthías Sandholt',
      'Kristján Ármann',
      'Birgir Ívarsson',
      'Magnús Úlfarsson',
    ],
  },
  {
    name: 'BH-B',
    club: 'BH',
    players: [
      'Thomas Charukevic',
      'Alexander Ivanov',
      'Sól Kristínardóttir Mixa',
      'Noa Nilsson',
      'Heiðar Sölvason',
      'Jóhannes Urbancic Tómasson',
    ],
  },
  {
    name: 'HK-A',
    club: 'HK',
    players: [
      'Óskar Agnarsson',
      'Björn Gunnarsson',
      'Mariusz Rosinski',
      'Darian Róbertsson Kinghorn',
      'Sindri Sigurðsson',
    ],
  },
  {
    name: 'KR-A',
    club: 'KR',
    players: ['Luca Aquino', 'Norbert Bedö', 'Gestur Gunnarsson', 'Pétur Gunnarsson', 'Davíð Jónsson'],
  },
  {
    name: 'KR-B',
    club: 'KR',
    players: ['Karl Claesson', 'Ellert Georgsson', 'Eiríkur Gunnarsson', 'Lúkas Ólason'],
  },
  {
    name: 'Víkingur-A',
    club: 'Víkingur',
    players: [
      'Isak Alfredsson',
      'Stefán Birkisson',
      'Isak Edwardsson',
      'Daði Guðmundsson',
      'Benedikt Jóhannsson',
      'Hugo Nylen',
      'Viktor Pulgar',
      'Ingi Rodriquez',
      'Charlie Widing',
      'Anton Ólafsson',
    ],
  },
];

const SNAELAND = 'Íþróttahús Snælandsskóla, Kópavogi';
const STRANDGATA = 'Íþróttahúsið við Strandgötu, Hafnarfirði';
const HAGASKOLI = 'Íþróttahús Hagaskóla, Reykjavík';
const TBR = 'TBR-húsið, Reykjavík';

export const SEED_ROUNDS: SeedRound[] = [
  {
    number: 1,
    date: '2026-09-19',
    venue: SNAELAND,
    devAccessCode: '271828',
    encounters: [
      ['KR-A', 'KR-B'],
      ['BH-B', 'BH-A'],
      ['Víkingur-A', 'HK-A'],
    ],
  },
  {
    number: 2,
    date: '2026-09-19',
    venue: SNAELAND,
    devAccessCode: '161803',
    encounters: [
      ['Víkingur-A', 'BH-B'],
      ['BH-A', 'KR-A'],
      ['HK-A', 'KR-B'],
    ],
  },
  {
    number: 3,
    date: '2026-10-17',
    venue: STRANDGATA,
    devAccessCode: '141421',
    encounters: [
      ['KR-A', 'Víkingur-A'],
      ['KR-B', 'BH-A'],
      ['BH-B', 'HK-A'],
    ],
  },
  {
    number: 4,
    date: '2026-10-17',
    venue: STRANDGATA,
    devAccessCode: '482913',
    encounters: [
      ['BH-B', 'KR-A'],
      ['Víkingur-A', 'KR-B'],
      ['HK-A', 'BH-A'],
    ],
  },
  {
    number: 5,
    date: '2026-11-22',
    venue: HAGASKOLI,
    devAccessCode: '577215',
    encounters: [
      ['BH-A', 'Víkingur-A'],
      ['KR-B', 'BH-B'],
      ['KR-A', 'HK-A'],
    ],
  },
  {
    number: 6,
    date: '2026-11-22',
    venue: HAGASKOLI,
    devAccessCode: '662607',
    encounters: [
      ['HK-A', 'Víkingur-A'],
      ['BH-A', 'BH-B'],
      ['KR-B', 'KR-A'],
    ],
  },
  {
    number: 7,
    date: '2027-01-09',
    venue: HAGASKOLI,
    devAccessCode: '299792',
    encounters: [
      ['BH-B', 'Víkingur-A'],
      ['KR-A', 'BH-A'],
      ['KR-B', 'HK-A'],
    ],
  },
  {
    number: 8,
    date: '2027-01-09',
    venue: HAGASKOLI,
    devAccessCode: '602214',
    encounters: [
      ['HK-A', 'BH-B'],
      ['Víkingur-A', 'KR-A'],
      ['BH-A', 'KR-B'],
    ],
  },
  {
    number: 9,
    date: '2027-03-06',
    venue: TBR,
    devAccessCode: '173205',
    encounters: [
      ['KR-B', 'Víkingur-A'],
      ['KR-A', 'BH-B'],
      ['BH-A', 'HK-A'],
    ],
  },
  {
    number: 10,
    date: '2027-03-06',
    venue: TBR,
    devAccessCode: '223606',
    encounters: [
      ['HK-A', 'KR-A'],
      ['BH-B', 'KR-B'],
      ['Víkingur-A', 'BH-A'],
    ],
  },
];
