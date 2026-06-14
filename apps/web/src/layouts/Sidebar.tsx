import { useState, useEffect } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../stores/data';
import { api } from '../lib/api';
import { NotificationBadge } from '../components/NotificationBadge';
import { canAccess } from '../lib/permissions';
import { LayoutDashboard, Store, Bell, Settings, Package, BookOpen, Users, BarChart3, Clock, FileText, DollarSign, Divide, LogOut, ChevronRight, ArrowLeft } from 'lucide-react';

const roleLabels: Record<string, string> = { ADMIN: '系统管理员',
  STORE_ADMIN: '店铺管理员', MANAGER: '店长', STAFF: '员工', SHAREHOLDER: '股东' };

export function Sidebar() {
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    const fetch = () => api.get('/notifications/unread-count').then((d) => setUnreadCount(d.count || 0)).catch(() => {});
    fetch(); const t = setInterval(fetch, 30000); return () => clearInterval(t);
  }, []);
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const { storeId } = useParams();
  const role = user?.role;
  const isAdmin = role === 'ADMIN';

  const adminNav = [
    { to: '/', icon: LayoutDashboard, label: '仪表盘', key: 'dashboard' },
    { to: '/stores', icon: Store, label: '门店管理', key: 'stores' },
    { to: '/notifications', icon: Bell, label: '消息通知', key: 'notifications', badge: true },
    { to: '/upgrade', icon: Settings, label: '系统设置', key: 'upgrade' },
  ];

  const storeNav = storeId ? [
    { to: '/store/' + storeId, icon: LayoutDashboard, label: '门店总览', key: 'storeOverview', end: true },
    { to: '/store/' + storeId + '/entries', icon: BookOpen, label: '记账', key: 'storeEntries' },
    { to: '/store/' + storeId + '/inventory', icon: Package, label: '盘点', key: 'storeInventory' },
    { to: '/store/' + storeId + '/shifts', icon: Clock, label: '开闭店', key: 'storeShifts' },
    { to: '/store/' + storeId + '/report', icon: BarChart3, label: '报表', key: 'storeReport' },
    { to: '/store/' + storeId + '/notifications', icon: Bell, label: '消息通知', key: 'storeNotifications', badge: true },
    { to: '/store/' + storeId + '/notification-settings', icon: Settings, label: '消息推送', key: 'storeAdminSettings' },
    { to: '/store/' + storeId + '/payroll', icon: DollarSign, label: '工资', key: 'storePayroll' },
    { to: '/store/' + storeId + '/dividends', icon: Divide, label: '分红', key: 'storeDividends' },
    { to: '/store/' + storeId + '/staff', icon: Users, label: '员工', key: 'storeStaff' },
    { to: '/store/' + storeId + '/logs', icon: FileText, label: '日志', key: 'storeLogs' },
    { to: '/store/' + storeId + '/settings', icon: Settings, label: '设置', key: 'storeSettings' },
  ] : [];

  const currentNav = storeId ? storeNav : adminNav;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/30 bg-white/50 backdrop-blur-2xl lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-white/30 px-5">
        <img src="/logo.png" alt="Logo" className="h-11 w-11 rounded-xl object-cover shrink-0" />
        <span className="rounded-full bg-gradient-to-r from-indigo-50 to-purple-50 flex-1 px-4 py-2 text-base font-bold text-indigo-700 text-center">Multi Shop Link</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {storeId && isAdmin && (
          <button onClick={() => navigate('/')} className="mb-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-all">
            <ArrowLeft className="h-4 w-4" />返回管理
          </button>
        )}
        {currentNav.filter(n => canAccess(n.key, role)).map((n) => (
          <NavLink key={n.to} to={n.to} end={'end' in n && n.end === true ? true : undefined}
            className={({ isActive }) => 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ' + (isActive ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900')}>
            <span className="relative">
              <n.icon className="h-4 w-4" />
              {'badge' in n && n.badge && <NotificationBadge poll interval={30000} />}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/30 px-3 py-3">
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 p-2 flex items-center justify-center">
          <img src="data:image/png;base64,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" alt="Mingtu" className="w-full max-h-32 object-contain rounded-xl" />
        </div>
      </div>
      <div className="border-t border-white/30 p-3 space-y-2">
        <button onClick={() => navigate(storeId ? '/store/' + storeId + '/account' : '/admin-settings')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-white/60 transition-all">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 shrink-0 overflow-hidden">
            {user?.avatar ? <img src={user.avatar} className="h-full w-full object-cover" alt="" /> : (user?.name?.[0] || '用')}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{user?.name}</div>
            <div className="text-xs text-slate-400">{roleLabels[user?.role || ''] || user?.role}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
