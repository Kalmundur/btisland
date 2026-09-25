import { describe, expect, it } from 'vitest';
import { fromFormValue, initialFormValues, invalidFields, toFormValue, toRowValues } from './formValues';
import { resourceByKey, RESOURCES, type FieldConfig } from './resources';

const f = (type: FieldConfig['type'], extra: Partial<FieldConfig> = {}): FieldConfig => ({
  name: 'x',
  label: 'name',
  type,
  ...extra,
});

describe('admin form values', () => {
  it('converts DB values to inputs', () => {
    expect(toFormValue(f('time'), '14:30:00')).toBe('14:30');
    expect(toFormValue(f('checkbox', { defaultValue: true }), undefined)).toBe(true);
    expect(toFormValue(f('number', { defaultValue: 0 }), null)).toBe('0');
    expect(toFormValue(f('text'), null)).toBe('');
  });

  it('converts inputs to DB values, empty -> null', () => {
    expect(fromFormValue(f('number'), '4')).toBe(4);
    expect(fromFormValue(f('number'), '')).toBeNull();
    expect(fromFormValue(f('time'), '')).toBeNull();
    expect(fromFormValue(f('text'), '  Víkingur ')).toBe('Víkingur');
    expect(fromFormValue(f('checkbox'), false)).toBe(false);
  });

  it('builds a full row for rounds with nullable time', () => {
    const rounds = resourceByKey('rounds')!;
    const values = initialFormValues(rounds.fields, null);
    expect(invalidFields(rounds.fields, values).sort()).toEqual(['division_id', 'number', 'round_date']);
    values.number = '4';
    values.division_id = 'd1';
    values.round_date = '2026-10-17';
    expect(invalidFields(rounds.fields, values)).toEqual([]);
    expect(toRowValues(rounds.fields, values)).toEqual({
      number: 4,
      division_id: 'd1',
      round_date: '2026-10-17',
      start_time: null,
      venue: null,
    });
  });

  it('flags unparseable numbers', () => {
    expect(invalidFields([f('number')], { x: 'abc' })).toEqual(['x']);
  });

  it('every resource has a primary key and at least one listed column', () => {
    for (const r of RESOURCES) {
      expect(r.primaryKey.length).toBeGreaterThan(0);
      expect(r.fields.some((field) => field.list)).toBe(true);
    }
  });
});
