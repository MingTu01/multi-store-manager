import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useStore } from './stores/data';
import { canAccess } from './lib/permissions';
import { AppShell } from './layouts/AppShell';
import { StoreGuard } from './components/StoreGuard';
import LoginPage from './pages/login/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import StoresPage from './pages/stores/StoresPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import SettingsPage from './pages/settings/SettingsPage';
import PasswordPage from './pages/settings/PasswordPage';
import AdminSettingsPage from './pages/settings/AdminSettingsPage';
import StoreOverviewPage from './pages/store/StoreOverviewPage';
import StoreEntriesPage from './pages/store/StoreEntriesPage';
import StoreInventoryPage from './pages/store/StoreInventoryPage';
import StoreShiftsPage from './pages/store/StoreShiftsPage';
import StoreReportPage from './pages/store/StoreReportPage';
import StorePayrollPage from './pages/store/StorePayrollPage';
import StoreDividendsPage from './pages/store/StoreDividendsPage';
import StoreStaffPage from './pages/store/StoreStaffPage';
import StoreLogsPage from './pages/store/StoreLogsPage';
import StoreSettingsPage from './pages/store/StoreSettingsPage';

function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
  const role = useStore((s) => s.user?.role);
  const loading = useStore((s) => s.loading);
  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-400">加载中..</div></div>;
  if (!role) return <Navigate to="/login" replace />;
  if (!canAccess(perm, role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const restore = useStore((s) => s.restore);
  useEffect(() => { restore(); }, [restore]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppShell />}>
        <Route index element={<Guard perm="dashboard"><DashboardPage /></Guard>} />
        <Route path="stores" element={<Guard perm="stores"><StoresPage /></Guard>} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="upgrade" element={<Guard perm="upgrade"><SettingsPage /></Guard>} />
        <Route path="password" element={<PasswordPage />} />
        <Route path="admin-settings" element={<AdminSettingsPage />} />
        <Route path="store/:storeId" element={<StoreGuard><StoreOverviewPage /></StoreGuard>} />
        <Route path="store/:storeId/entries" element={<StoreGuard><StoreEntriesPage /></StoreGuard>} />
        <Route path="store/:storeId/inventory" element={<StoreGuard><StoreInventoryPage /></StoreGuard>} />
        <Route path="store/:storeId/shifts" element={<StoreGuard><StoreShiftsPage /></StoreGuard>} />
        <Route path="store/:storeId/payroll" element={<StoreGuard><StorePayrollPage /></StoreGuard>} />
        <Route path="store/:storeId/dividends" element={<StoreGuard><StoreDividendsPage /></StoreGuard>} />
        <Route path="store/:storeId/staff" element={<StoreGuard><StoreStaffPage /></StoreGuard>} />
        <Route path="store/:storeId/report" element={<StoreGuard><StoreReportPage /></StoreGuard>} />
        <Route path="store/:storeId/logs" element={<StoreGuard><StoreLogsPage /></StoreGuard>} />
        <Route path="store/:storeId/settings" element={<StoreGuard><StoreSettingsPage /></StoreGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}