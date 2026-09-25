import { describe, expect, it } from 'vitest';
import { classifyError } from './errors';

describe('error classification', () => {
  it('recognises connectivity problems', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyError({ message: 'anything' }, false)).toBe('offline');
  });

  it('recognises auth and permission problems', () => {
    expect(classifyError({ code: 'PGRST301', message: 'JWT expired' })).toBe('sessionExpired');
    expect(classifyError({ code: '42501', message: 'permission denied for table clubs' })).toBe('forbidden');
    expect(classifyError({ code: '42501', message: 'new row violates row-level security policy' })).toBe('forbidden');
  });

  it('recognises data problems', () => {
    expect(classifyError({ code: '23505', message: 'duplicate key value' })).toBe('duplicate');
    expect(classifyError({ code: '23503', message: 'violates foreign key constraint' })).toBe('inUse');
    expect(classifyError({ code: '22P02', message: 'invalid input syntax for type uuid' })).toBe('invalid');
    expect(classifyError({ code: 'P0002', message: 'not_found' })).toBe('notFound');
  });

  it('falls back to a generic message and knows the not-configured case', () => {
    expect(classifyError(new Error('boom'))).toBe('generic');
    const e = new Error('x');
    e.name = 'SupabaseNotConfiguredError';
    expect(classifyError(e)).toBe('notConfigured');
  });
});
