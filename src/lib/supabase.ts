import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False until real credentials are put in .env.local – the app still builds and renders. */
export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes('YOUR-PROJECT-REF') && !anonKey.includes('YOUR-ANON-KEY'),
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
    this.name = 'SupabaseNotConfiguredError';
  }
}

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new SupabaseNotConfiguredError();
  return supabase;
}
