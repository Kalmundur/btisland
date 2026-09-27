import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider } from './state/AuthContext';
import { LeagueProvider } from './state/LeagueContext';
import { ProfileProvider } from './state/ProfileContext';
import { PlayerLayout } from './components/PlayerLayout';
import { LoadingState } from './components/StateViews';
import { ScorecardPage } from './features/scorecard/ScorecardPage';
import { StandingsPage } from './features/standings/StandingsPage';
import { PlayersPage } from './features/players/PlayersPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PlayerProfileEditPage } from './features/profile/PlayerProfilePages';
import { LivePage, MatchPage, RoundPage } from './features/live/LivePages';
import { TeamPage } from './features/team/TeamPage';
import { PlayerPage } from './features/players/PlayerPage';
import { NotFoundPage } from './features/NotFoundPage';
import { RouteError } from './components/RouteError';
import { claimAutoReload, isChunkLoadError } from './lib/chunkReload';
import { reloadToLatest } from './lib/pwa';

// A tab opened before a deploy may ask for a chunk hash that no longer exists: reload once
// onto the new build instead of failing (RouteError explains it if that does not help).
const AdminApp = lazy(() =>
  import('./features/admin/AdminApp').catch((error: unknown) => {
    if (isChunkLoadError(error) && claimAutoReload()) {
      reloadToLatest();
      return new Promise<never>(() => {});
    }
    throw error;
  }),
);

const router = createBrowserRouter([
  {
    element: <PlayerLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/scorecard" replace /> },
      // The four permanent tabs
      { path: 'scorecard', element: <ScorecardPage /> },
      { path: 'scorecard/match/:matchNumber', element: <ScorecardPage /> },
      { path: 'schedule', element: <LivePage /> },
      { path: 'standings', element: <StandingsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/player-profile', element: <PlayerProfileEditPage /> },
      // Public deep links (the full player list is reached from Staða)
      { path: 'players', element: <PlayersPage /> },
      // Old schedule links (shared before the Dagskrá tab existed) keep working.
      { path: 'live', element: <Navigate to="/schedule" replace /> },
      { path: 'live/round/:roundId', element: <RoundPage /> },
      { path: 'live/match/:encounterId', element: <MatchPage /> },
      { path: 'team/:teamId', element: <TeamPage /> },
      { path: 'player/:playerId', element: <PlayerPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin/*',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<LoadingState />}>
        <AdminApp />
      </Suspense>
    ),
  },
]);

export function App() {
  return (
    <AuthProvider>
      <LeagueProvider>
        <ProfileProvider>
          <RouterProvider router={router} />
        </ProfileProvider>
      </LeagueProvider>
    </AuthProvider>
  );
}
