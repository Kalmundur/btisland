import type { PostgrestError } from '@supabase/supabase-js';

export class DataError extends Error {
  readonly code: string | undefined;
  constructor(error: PostgrestError | { message: string; code?: string }) {
    super(error.message);
    this.name = 'DataError';
    this.code = error.code;
  }
}

/** Throws on error, returns data otherwise. */
export function unwrap<T>(result: { data: T | null; error: PostgrestError | null }): T {
  if (result.error) throw new DataError(result.error);
  return result.data as T;
}
