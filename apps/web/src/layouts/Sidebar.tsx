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
        <div className="rounded-2xl bg-slate-800 p-2 flex items-center justify-center">
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
