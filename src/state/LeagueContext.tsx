import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { getCurrentLeague } from '../data/leagueRepository';
import { useAsync, type AsyncState } from '../hooks/useAsync';
import type { LeagueContext as League } from '../domain/types';

/** The season + division shown in the public app (currently a single division). */
const LeagueCtx = createContext<AsyncState<League | null> | null>(null);

export function LeagueProvider({ children }: { children: ReactNode }) {
  const state = useAsync(
    () => (isSupabaseConfigured ? getCurrentLeague() : Promise.resolve(null)),
    [],
  );
  // Started without a connection: try again as soon as it is back.
  const { error, reload } = state;
  useEffect(() => {
    if (!error) return;
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [error, reload]);
  return <LeagueCtx.Provider value={state}>{children}</LeagueCtx.Provider>;
}

export function useLeague(): AsyncState<League | null> {
  const ctx = useContext(LeagueCtx);
  if (!ctx) throw new Error('useLeague must be used inside LeagueProvider');
  return ctx;
}
