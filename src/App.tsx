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
import { LivePage, MatchPage, RoundPage } from './features/live/LivePages';
import { TeamPage } from './features/team/TeamPage';
import { PlayerPage } from './features/players/PlayerPage';
import { NotFoundPage } from './features/NotFoundPage';

const AdminApp = lazy(() => import('./features/admin/AdminApp'));

const router = createBrowserRouter([
  {
    element: <PlayerLayout />,
    children: [
      { index: true, element: <Navigate to="/scorecard" replace /> },
      // The four permanent tabs
      { path: 'scorecard', element: <ScorecardPage /> },
      { path: 'scorecard/match/:matchNumber', element: <ScorecardPage /> },
      { path: 'standings', element: <StandingsPage /> },
      { path: 'players', element: <PlayersPage /> },
      { path: 'settings', element: <SettingsPage /> },
      // Public deep links
      { path: 'live', element: <LivePage /> },
      { path: 'live/round/:roundId', element: <RoundPage /> },
      { path: 'live/match/:encounterId', element: <MatchPage /> },
      { path: 'team/:teamId', element: <TeamPage /> },
      { path: 'player/:playerId', element: <PlayerPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/admin/*',
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
