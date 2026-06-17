import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useStore } from './stores/data';
import { useSSE } from './lib/sse';
import { canAccess } from './lib/permissions';
import { AppShell } from './layouts/AppShell';
import { StoreGuard } from './components/StoreGuard';
import LoginPage from './pages/login/LoginPage';

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const StoresPage = lazy(() => import('./pages/stores/StoresPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const PasswordPage = lazy(() => import('./pages/settings/PasswordPage'));
const AdminSettingsPage = lazy(() => import('./pages/settings/AdminSettingsPage'));
const StoreOverviewPage = lazy(() => import('./pages/store/StoreOverviewPage'));
const StoreEntriesPage = lazy(() => import('./pages/store/StoreEntriesPage'));
const StoreInventoryPage = lazy(() => import('./pages/store/StoreInventoryPage'));
const StoreShiftsPage = lazy(() => import('./pages/store/StoreShiftsPage'));
const StoreReportPage = lazy(() => import('./pages/store/StoreReportPage'));
const StorePayrollPage = lazy(() => import('./pages/store/StorePayrollPage'));
const StoreDividendsPage = lazy(() => import('./pages/store/StoreDividendsPage'));
const StoreStaffPage = lazy(() => import('./pages/store/StoreStaffPage'));
const StoreLogsPage = lazy(() => import('./pages/store/StoreLogsPage'));
const StoreSettingsPage = lazy(() => import('./pages/store/StoreSettingsPage'));
const StoreAccountPage = lazy(() => import('./pages/store/StoreAccountPage'));
const StoreNotificationsPage = lazy(() => import('./pages/store/StoreNotificationsPage'));
const StoreNotificationSettingsPage = lazy(() => import('./pages/store/StoreNotificationSettingsPage'));

function Loading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
  const user = useStore((s) => s.user);
  const loading = useStore((s) => s.loading);
  if (loading) return <div className="flex h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(perm, user.role as any)) {
    // All store-related roles (MANAGER, STAFF, SHAREHOLDER, STORE_ADMIN): redirect to their store
    if (user.store_id) {
      return <Navigate to={'/store/' + user.store_id} replace />;
    }
    // No store: go to login
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const restore = useStore((s) => s.restore);
  useEffect(() => { restore(); }, [restore]);
  const user = useStore((s) => s.user);
  useSSE();

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Guard perm="dashboard"><DashboardPage /></Guard>} />
          <Route path="stores" element={<Guard perm="stores"><StoresPage /></Guard>} />
          <Route path="notifications" element={<Guard perm="notifications"><NotificationsPage /></Guard>} />
          <Route path="upgrade" element={<Guard perm="upgrade"><SettingsPage /></Guard>} />
          <Route path="password" element={<Guard perm="password"><PasswordPage /></Guard>} />
          <Route path="admin-settings" element={<Guard perm="adminSettings"><AdminSettingsPage /></Guard>} />
          <Route path="store/:storeId" element={<StoreGuard><StoreOverviewPage /></StoreGuard>} />
          <Route path="store/:storeId/entries" element={<StoreGuard><StoreEntriesPage /></StoreGuard>} />
          <Route path="store/:storeId/inventory" element={<StoreGuard><StoreInventoryPage /></StoreGuard>} />
          <Route path="store/:storeId/shifts" element={<StoreGuard><StoreShiftsPage /></StoreGuard>} />
          <Route path="store/:storeId/payroll" element={<StoreGuard><StorePayrollPage /></StoreGuard>} />
          <Route path="store/:storeId/dividends" element={<StoreGuard><StoreDividendsPage /></StoreGuard>} />
          <Route path="store/:storeId/staff" element={<StoreGuard><StoreStaffPage /></StoreGuard>} />
          <Route path="store/:storeId/report" element={<StoreGuard><StoreReportPage /></StoreGuard>} />
          <Route path="store/:storeId/logs" element={<StoreGuard><StoreLogsPage /></StoreGuard>} />
          <Route path="store/:storeId/account" element={<StoreGuard><StoreAccountPage /></StoreGuard>} />
          <Route path="store/:storeId/notifications" element={<StoreGuard><StoreNotificationsPage /></StoreGuard>} />
          <Route path="store/:storeId/notification-settings" element={<StoreGuard><StoreNotificationSettingsPage /></StoreGuard>} />
          <Route path="store/:storeId/settings" element={<StoreGuard><StoreSettingsPage /></StoreGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
