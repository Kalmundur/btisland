/**
 * Declarative admin resource definitions. CrudPage renders list + form from these,
 * so adding a column is a one-line change here.
 */
import { Building2, CalendarDays, CalendarRange, Layers, Shield, User, type LucideIcon } from 'lucide-react';
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
  /** Derived by the database: listed but never edited. */
  readOnly?: boolean;
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
} satisfies Record<string, RefOptions>;

/** Competition formats a division can use (mirrors public.competition_formats). */
const FORMAT_OPTIONS = [{ value: 'REGULAR_TEN_MATCH', labelKey: 'admin.formats.REGULAR_TEN_MATCH' }];

/**
 * The organizer portal's sections (Yfirlit is the dashboard). Registrations, teams in a
 * division and encounters are managed on the player, division and round detail pages.
 */
export const RESOURCES: ResourceConfig[] = [
  {
    key: 'clubs',
    table: 'clubs',
    nav: 'clubs',
    icon: Building2,
    primaryKey: ['id'],
    order: [{ column: 'name' }],
    detailPath: (row) => `/admin/clubs/${str(row.id)}`,
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'short_name', label: 'shortName', type: 'text', list: true },
      { name: 'logo_url', label: 'logoUrl', type: 'text' },
      { name: 'is_active', label: 'isActive', type: 'checkbox', defaultValue: true, list: true },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    key: 'teams',
    table: 'teams',
    nav: 'teams',
    icon: Shield,
    primaryKey: ['id'],
    order: [{ column: 'name' }],
    detailPath: (row) => `/admin/teams/${str(row.id)}`,
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'club_id', label: 'club', type: 'select', required: true, list: true, ref: REF.club },
      { name: 'is_active', label: 'isActive', type: 'checkbox', defaultValue: true, list: true },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true },
    ],
  },
  {
    key: 'players',
    table: 'players',
    nav: 'players',
    icon: User,
    primaryKey: ['id'],
    order: [{ column: 'full_name' }],
    detailPath: (row) => `/admin/players/${str(row.id)}`,
    fields: [
      { name: 'full_name', label: 'fullName', type: 'text', required: true, list: true },
      { name: 'club_id', label: 'club', type: 'select', required: true, list: true, ref: REF.club },
      { name: 'is_active', label: 'isActive', type: 'checkbox', defaultValue: true, list: true },
      { name: 'is_public', label: 'isPublic', type: 'checkbox', defaultValue: true },
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
    detailPath: (row) => `/admin/divisions/${str(row.id)}`,
    fields: [
      { name: 'name', label: 'name', type: 'text', required: true, list: true },
      { name: 'season_id', label: 'season', type: 'select', required: true, list: true, ref: REF.season },
      { name: 'format_key', label: 'format', type: 'select', required: true, defaultValue: 'REGULAR_TEN_MATCH', list: true, options: FORMAT_OPTIONS },
      { name: 'sort_order', label: 'sortOrder', type: 'number', defaultValue: 0 },
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
];

export const resourceByKey = (key: string) => RESOURCES.find((r) => r.key === key);
