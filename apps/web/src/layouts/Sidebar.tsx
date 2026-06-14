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
        <div className="h-9 w-9 rounded-xl object-cover" />
        <span className="text-base font-bold text-slate-900">Multi Shop Link</span>
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
