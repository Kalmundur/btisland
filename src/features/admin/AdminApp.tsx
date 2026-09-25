import { Route, Routes } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import { CrudPage } from './CrudPage';
import { RoundDetailPage } from './RoundDetailPage';
import { EncounterDetailPage } from './EncounterDetailPage';
import { ClubDetailPage, DivisionDetailPage, PlayerDetailPage, TeamDetailPage } from './EntityDetailPages';
import { RESOURCES } from './resources';
import { NotFoundPage } from '../NotFoundPage';
import '../../styles/admin.css';

/**
 * Organizer portal, mounted at /admin/* and loaded lazily so players never download it.
 * It does not use the player bottom navigation.
 */
export default function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        {RESOURCES.map((r) => (
          <Route key={r.key} path={r.key} element={<CrudPage key={r.key} resource={r} />} />
        ))}
        <Route path="rounds/:roundId" element={<RoundDetailPage />} />
        <Route path="encounters/:encounterId" element={<EncounterDetailPage />} />
        <Route path="clubs/:clubId" element={<ClubDetailPage />} />
        <Route path="teams/:teamId" element={<TeamDetailPage />} />
        <Route path="players/:playerId" element={<PlayerDetailPage />} />
        <Route path="divisions/:divisionId" element={<DivisionDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
