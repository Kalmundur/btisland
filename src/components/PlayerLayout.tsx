import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { BottomNav } from './BottomNav';
import { useAuth } from '../state/AuthContext';

/** Shell for the public/player app: content + fixed four-tab bottom navigation. */
export function PlayerLayout() {
  const { configured, ready, session, ensurePlayerSession } = useAuth();

  // Ordinary players never see a login: create an anonymous auth user silently.
  useEffect(() => {
    if (configured && ready && !session) void ensurePlayerSession();
  }, [configured, ready, session, ensurePlayerSession]);

  return (
    <div className="app">
      <main className="app-main">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
