import type { Session } from '@supabase/supabase-js';
import { requireSupabase } from '../lib/supabase';
import { DataError, unwrap } from './result';

export async function getSession(): Promise<Session | null> {
  const { data } = await requireSupabase().auth.getSession();
  return data.session;
}

export function onAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = requireSupabase().auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

/** Ordinary players: silently create an anonymous auth user for this device if none exists. */
export async function ensureAnonymousSession(): Promise<Session> {
  const existing = await getSession();
  if (existing) return existing;
  const { data, error } = await requireSupabase().auth.signInAnonymously();
  if (error || !data.session) throw new DataError(error ?? { message: 'Anonymous sign-in failed' });
  return data.session;
}

export async function signInOrganizer(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw new DataError(error);
}

export async function signOut(): Promise<void> {
  await requireSupabase().auth.signOut();
}

export async function isCurrentUserOrganizer(userId: string): Promise<boolean> {
  const row = unwrap(
    await requireSupabase().from('organizers').select('user_id').eq('user_id', userId).maybeSingle(),
  );
  return row !== null;
}
