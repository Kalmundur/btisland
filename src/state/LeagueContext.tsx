import { createContext, useContext, type ReactNode } from 'react';
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
  return <LeagueCtx.Provider value={state}>{children}</LeagueCtx.Provider>;
}

export function useLeague(): AsyncState<League | null> {
  const ctx = useContext(LeagueCtx);
  if (!ctx) throw new Error('useLeague must be used inside LeagueProvider');
  return ctx;
}
