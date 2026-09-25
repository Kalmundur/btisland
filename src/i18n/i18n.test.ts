import { describe, expect, it } from 'vitest';
import { is } from './locales/is';
import { en } from './locales/en';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function placeholders(obj: object): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (o: object, prefix: string) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') out[prefix + k] = (v.match(/{{\w+}}/g) ?? []).sort();
      else walk(v as object, `${prefix}${k}.`);
    }
  };
  walk(obj, '');
  return out;
}

describe('translations', () => {
  it('Icelandic and English have identical keys', () => {
    expect(keys(en).sort()).toEqual(keys(is).sort());
  });

  it('interpolation placeholders match between languages', () => {
    expect(placeholders(en)).toEqual(placeholders(is));
  });

  it('no empty strings', () => {
    const empty = (o: object): boolean =>
      Object.values(o).some((v) => (typeof v === 'string' ? v.trim() === '' : empty(v as object)));
    expect(empty(is)).toBe(false);
    expect(empty(en)).toBe(false);
  });
});
