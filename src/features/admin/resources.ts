/**
 * Declarative admin resource definitions. CrudPage renders list + form from these,
 * so adding a column is a one-line change here.
 */
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  Layers,
  ListChecks,
  Shield,
  Swords,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { AdminRow, AdminTable } from '../../data/adminRepository';
import type { Translation } from '../../i18n/locales/is';

export type FieldKey = keyof Translation['admin']['fields'];
export type NavKey = keyof Translation['admin']['nav'];

export interface RefOptions {
  table: AdminTable;
  order: ReadonlyArray<{ column: string; ascending?: boolean }>;
  label: (row: AdminRow) => string;
}

export interface FieldConfig {
  name: string;
  label: FieldKey;
  type: 'text' | 'number' | 'date' | 'time' | 'checkbox' | 'select';
  required?: boolean;
  /** Shown as a column in the list. */
  list?: boolean;
  defaultValue?: unknown;
  ref?: RefOptions;
  /** Static select options: value + i18n key. */
  options?: ReadonlyArray<{ value: string; labelKey: string }>;
}

export interface ResourceConfig {
  key: string;
  table: AdminTable;
  nav: NavKey;
  icon: LucideIcon;
  primaryKey: string[];
  order: ReadonlyArray<{ column: string; ascending?: boolean }>;
  fields: FieldConfig[];
  /** Rows can be edited in place (false for pure link tables). */
  editable?: boolean;
  /** Optional per-row detail page. */
  detailPath?: (row: AdminRow) => string;
}

const str = (v: unknown) => (v == null ? '' : String(v));

const REF = {
  club: { table: 'clubs', order: [{ column: 'name' }], label: (r) => str(r.name) },
  team: { table: 'teams', order: [{ column: 'name' }], label: (r) => str(r.name) },
  player: { table: 'players', order: [{ column: 'full_name' }], label: (r) => str(r.full_name) },
  season: { table: 'seasons', order: [{ column: 'name', ascending: false }], label: (r) => str(r.name) },
  division: { table: 'divisions', order: [{ column: 'sort_order' }], label: (r) => str(r.name) },
  round: {
    table: 'rounds',
    order: [{ column: 'number' }],
    label: (r) => `#${str(r.number)} · ${str(r.round_date)}`,
  },
} satisfies Record<string, RefOptions>;

const ENCOUNTER_STATUSES = [
  'scheduled',
  'lineups',
  'in_progress',
  'awaiting_confirmation',
  'completed',
  'cancelled',
].map((s) => ({ value: s, labelKey: `status.${s}` }));

export const RESOURCES: ResourceConfig[] = [
  {
    key: 'clubs',
    table: 'clubs',
    nav: 'clubs',
    icon: Building2,
    primaryKey: ['id'],
    order: [{ column: 'name' }],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'short_name', label: 'shortName', type: 'text', required: true, list: true },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true, list: true },
    ],
  },
  {
    key: 'teams',
    table: 'teams',
    nav: 'teams',
    icon: Shield,
    primaryKey: ['id'],
    order: [{ column: 'name' }],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'club_id', label: 'club', type: 'select', required: true, list: true, ref: REF.club },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true, list: true },
    ],
  },
  {
    key: 'players',
    table: 'players',
    nav: 'players',
    icon: User,
    primaryKey: ['id'],
    order: [{ column: 'full_name' }],
    fields: [
      { name: 'full_name', label: 'fullName', type: 'text', required: true, list: true },
      { name: 'club_id', label: 'club', type: 'select', required: true, list: true, ref: REF.club },
      { name: 'is_active', label: 'isActive', type: 'checkbox', defaultValue: true, list: true },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    key: 'registrations',
    table: 'team_registrations',
    nav: 'registrations',
    icon: ClipboardCheck,
    primaryKey: ['id'],
    order: [{ column: 'created_at', ascending: false }],
    fields: [
      { name: 'player_id', label: 'player', type: 'select', required: true, list: true, ref: REF.player },
      { name: 'team_id', label: 'team', type: 'select', required: true, list: true, ref: REF.team },
      { name: 'season_id', label: 'season', type: 'select', required: true, list: true, ref: REF.season },
      { name: 'division_id', label: 'division', type: 'select', required: true, list: true, ref: REF.division },
      { name: 'is_active', label: 'isActive', type: 'checkbox', defaultValue: true, list: true },
    ],
  },
  {
    key: 'seasons',
    table: 'seasons',
    nav: 'seasons',
    icon: CalendarRange,
    primaryKey: ['id'],
    order: [{ column: 'name', ascending: false }],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'starts_on', label: 'startsOn', type: 'date', list: true },
      { name: 'ends_on', label: 'endsOn', type: 'date', list: true },
      { name: 'is_current', label: 'isCurrent', type: 'checkbox', defaultValue: false, list: true },
    ],
  },
  {
    key: 'divisions',
    table: 'divisions',
    nav: 'divisions',
    icon: Layers,
    primaryKey: ['id'],
    order: [{ column: 'sort_order' }],
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'season_id', label: 'season', type: 'select', required: true, list: true, ref: REF.season },
      { name: 'sort_order', label: 'sortOrder', type: 'number', defaultValue: 0, list: true },
    ],
  },
  {
    key: 'division-teams',
    table: 'division_teams',
    nav: 'divisionTeams',
    icon: ListChecks,
    primaryKey: ['division_id', 'team_id'],
    order: [{ column: 'division_id' }],
    editable: false,
    fields: [
      { name: 'division_id', label: 'division', type: 'select', required: true, list: true, ref: REF.division },
      { name: 'team_id', label: 'team', type: 'select', required: true, list: true, ref: REF.team },
    ],
  },
  {
    key: 'rounds',
    table: 'rounds',
    nav: 'rounds',
    icon: CalendarDays,
    primaryKey: ['id'],
    order: [{ column: 'number' }],
    detailPath: (row) => `/admin/rounds/${str(row.id)}`,
    fields: [
      { name: 'number', label: 'number', type: 'number', required: true, list: true },
      { name: 'division_id', label: 'division', type: 'select', required: true, list: true, ref: REF.division },
      { name: 'round_date', label: 'date', type: 'date', required: true, list: true },
      { name: 'start_time', label: 'startTime', type: 'time', list: true },
      { name: 'venue', label: 'venue', type: 'text', list: true },
    ],
  },
  {
    key: 'encounters',
    table: 'encounters',
    nav: 'encounters',
    icon: Swords,
    primaryKey: ['id'],
    order: [{ column: 'created_at' }],
    fields: [
      { name: 'round_id', label: 'round', type: 'select', required: true, list: true, ref: REF.round },
      { name: 'home_team_id', label: 'homeTeam', type: 'select', required: true, list: true, ref: REF.team },
      { name: 'away_team_id', label: 'awayTeam', type: 'select', required: true, list: true, ref: REF.team },
      { name: 'status', label: 'status', type: 'select', required: true, defaultValue: 'scheduled', list: true, options: ENCOUNTER_STATUSES },
      { name: 'home_score', label: 'homeScore', type: 'number', list: true },
      { name: 'away_score', label: 'awayScore', type: 'number', list: true },
    ],
  },
];

export const resourceByKey = (key: string) => RESOURCES.find((r) => r.key === key);
