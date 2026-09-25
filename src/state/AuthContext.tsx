import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured } from '../lib/supabase';
import { ensureAnonymousSession, getSession, onAuthChange } from '../data/authRepository';

interface AuthState {
  configured: boolean;
  /** True once the stored session (if any) has been restored. */
  ready: boolean;
  session: Session | null;
  userId: string | null;
  isAnonymous: boolean;
  /** Player app: make sure this device has an (anonymous) auth user. */
  ensurePlayerSession: () => Promise<void>;
  authError: unknown;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getSession()
      .then((s) => active && setSession(s))
      .catch((e: unknown) => active && setAuthError(e))
      .finally(() => active && setReady(true));
    const unsubscribe = onAuthChange((s) => setSession(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const ensurePlayerSession = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      setAuthError(undefined);
      setSession(await ensureAnonymousSession());
    } catch (e) {
      setAuthError(e);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      configured: isSupabaseConfigured,
      ready,
      session,
      userId: session?.user.id ?? null,
      isAnonymous: session?.user.is_anonymous ?? false,
      ensurePlayerSession,
      authError,
    }),
    [ready, session, ensurePlayerSession, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
