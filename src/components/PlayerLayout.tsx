import { useEffect, useState } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { BottomNav } from './BottomNav';
import { ConnectivityBanner } from './ConnectivityBanner';
import { useAuth } from '../state/AuthContext';

/**
 * True while the on-screen keyboard takes a large part of the viewport. On Android the
 * layout viewport shrinks and a fixed bottom nav would sit on top of the focused input.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const check = () => {
      const editing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      setOpen(editing && window.screen.height - vv.height > 220);
    };
    vv.addEventListener('resize', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      vv.removeEventListener('resize', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
    };
  }, []);
  return open;
}

/** Shell for the public/player app: content + fixed four-tab bottom navigation. */
export function PlayerLayout() {
  const { configured, ready, session, ensurePlayerSession } = useAuth();
  const keyboardOpen = useKeyboardOpen();

  // Ordinary players never see a login: create an anonymous auth user silently.
  useEffect(() => {
    if (configured && ready && !session) void ensurePlayerSession();
  }, [configured, ready, session, ensurePlayerSession]);

  return (
    <div className={`app${keyboardOpen ? ' app--keyboard' : ''}`}>
      <ScrollRestoration />
      <main className="app-main">
        <ConnectivityBanner />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
