import type { AdminRow } from '../../data/adminRepository';
import type { FieldConfig } from './resources';

export type FormValue = string | boolean;
export type FormValues = Record<string, FormValue>;

/** DB value -> controlled input value. */
export function toFormValue(field: FieldConfig, raw: unknown): FormValue {
  if (field.type === 'checkbox') return raw == null ? Boolean(field.defaultValue) : Boolean(raw);
  if (raw == null) return field.defaultValue == null ? '' : String(field.defaultValue);
  if (field.type === 'time') return String(raw).slice(0, 5);
  return String(raw);
}

export function initialFormValues(fields: readonly FieldConfig[], row: AdminRow | null): FormValues {
  return Object.fromEntries(fields.map((f) => [f.name, toFormValue(f, row ? row[f.name] : undefined)]));
}

/** Input value -> DB value. Empty optional inputs become null. */
export function fromFormValue(field: FieldConfig, value: FormValue): unknown {
  if (field.type === 'checkbox') return Boolean(value);
  const s = String(value).trim();
  if (s === '') return null;
  if (field.type === 'number') return Number(s);
  return s;
}

export function toRowValues(fields: readonly FieldConfig[], values: FormValues): AdminRow {
  return Object.fromEntries(fields.map((f) => [f.name, fromFormValue(f, values[f.name])]));
}

/** Names of required fields that are empty (or numbers that do not parse). */
export function invalidFields(fields: readonly FieldConfig[], values: FormValues): string[] {
  return fields
    .filter((f) => {
      const v = values[f.name];
      if (f.type === 'checkbox') return false;
      const s = String(v ?? '').trim();
      if (f.type === 'number' && s !== '' && !Number.isFinite(Number(s))) return true;
      return !!f.required && s === '';
    })
    .map((f) => f.name);
}
