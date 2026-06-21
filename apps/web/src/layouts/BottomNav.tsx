import { useState, useEffect } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useStore } from '../stores/data';
import { canAccess } from '../lib/permissions';
import { api } from '../lib/api';
import { NotificationBadge } from '../components/NotificationBadge';
import { useNotificationStore } from '../stores/notification';
import { LayoutDashboard, Store, Bell, Settings, BookOpen, Package, Clock, BarChart3, Users, DollarSign, Divide, FileText, MoreHorizontal, X, User, ArrowLeft, Truck } from 'lucide-react';

// All store tabs in priority order
const ALL_STORE_TABS = [
  { to: (id: string) => '/store/' + id, icon: LayoutDashboard, label: '总览', key: 'storeOverview', end: true },
  { to: (id: string) => '/store/' + id + '/entries', icon: BookOpen, label: '记账', key: 'storeEntries' },
  { to: (id: string) => '/store/' + id + '/purchase', icon: Truck, label: '进货', key: 'storePurchase' },
  { to: (id: string) => '/store/' + id + '/shifts', icon: Clock, label: '开闭店', key: 'storeShifts' },
  { to: (id: string) => '/store/' + id + '/inventory', icon: Package, label: '盘点', key: 'storeInventory' },
  { to: (id: string) => '/store/' + id + '/report', icon: BarChart3, label: '报表', key: 'storeReport' },
  { to: (id: string) => '/store/' + id + '/staff', icon: Users, label: '员工', key: 'storeStaff' },
  { to: (id: string) => '/store/' + id + '/payroll', icon: DollarSign, label: '工资', key: 'storePayroll' },
  { to: (id: string) => '/store/' + id + '/dividends', icon: Divide, label: '分红', key: 'storeDividends' },
  { to: (id: string) => '/store/' + id + '/notifications', icon: Bell, label: '通知', key: 'storeNotifications', badge: true },
  { to: (id: string) => '/store/' + id + '/notification-settings', icon: Settings, label: '消息推送', key: 'storeNotificationSettings' },
  { to: (id: string) => '/store/' + id + '/logs', icon: FileText, label: '日志', key: 'storeLogs' },
  { to: (id: string) => '/store/' + id + '/settings', icon: Settings, label: '设置', key: 'storeSettings' },
  { to: (id: string) => '/store/' + id + '/account', icon: User, label: '我的', key: 'storeAccount' },
];

const ADMIN_TABS = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘', key: 'dashboard' },
  { to: '/stores', icon: Store, label: '门店', key: 'stores' },
  { to: '/notifications', icon: Bell, label: '通知', key: 'notifications', badge: true },
  { to: '/upgrade', icon: Settings, label: '设置', key: 'upgrade' },
  { to: '/admin-settings', icon: User, label: '我的', key: 'adminSettings' },
];

const MAX_DIRECT = 5;

export function BottomNav() {
  const user = useStore((s) => s.user);
  const { storeId } = useParams();
  const role = user?.role;
  const [showMore, setShowMore] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);

  useEffect(() => { fetchUnread(); const t = setInterval(fetchUnread, 60000); return () => clearInterval(t); }, [fetchUnread]);
  useEffect(() => {
    if (!storeId) { setStoreOpen(null); return; }
    api.get('/stores/' + storeId).then((d: any) => {
      setStoreOpen(d.is_open === 1);
    }).catch(() => setStoreOpen(true));
  }, [storeId]);

  // Store closed: only admin roles see return button
  if (storeId && storeOpen === false) {
    if (user?.role === 'ADMIN' || user?.role === 'STORE_ADMIN') {
      return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/80 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-end justify-around">
            <NavLink to="/" className="flex flex-shrink-0 flex-col items-center gap-0.5 py-2 pt-2.5 text-xs text-indigo-600 font-semibold min-w-[56px] px-1">
              <span className="flex h-5 w-5 items-center justify-center"><ArrowLeft className="h-5 w-5" /></span>
              <span className="truncate max-w-[52px]">返回管理</span>
            </NavLink>
          </div>
        </nav>
      );
    }
    return null;
  }
  if (storeId && storeOpen === null) return null;

  // Admin page nav
  if (!storeId) {
    const filtered = ADMIN_TABS.filter(t => canAccess(t.key as any, role));
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/80 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-end justify-around">
          {filtered.map(t => (
            <NavLink key={t.to} to={t.to}
              className={({ isActive }) => 'flex flex-shrink-0 flex-col items-center gap-0.5 py-2 pt-2.5 text-xs transition-colors min-w-[56px] px-1 ' + (isActive ? 'font-semibold text-indigo-600' : 'text-slate-400')}>
              <span className="relative flex h-5 w-5 items-center justify-center">
                <t.icon className="h-5 w-5" />
                {t.badge && <NotificationBadge count={unreadCount} />}
              </span>
              <span className="truncate max-w-[52px]">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    );
  }

  // Store nav: filter by role, split into direct/more based on count
  const storeIdVal = storeId as string;
  const accessible = ALL_STORE_TABS.filter(t => canAccess(t.key as any, role));
  const directTabs = accessible.length <= MAX_DIRECT ? accessible : accessible.slice(0, MAX_DIRECT - 1);
  const moreTabs = accessible.length <= MAX_DIRECT ? [] : accessible.slice(MAX_DIRECT - 1);

  const navItem = (t: typeof accessible[0]) => (
    <NavLink key={t.key} to={t.to(storeIdVal)} end={('end' in t && (t as any).end === true) ? true : undefined} onClick={() => setShowMore(false)}
      className={({ isActive }) => 'flex flex-shrink-0 flex-col items-center gap-0.5 py-2 pt-2.5 text-xs transition-colors min-w-[56px] px-1 ' + (isActive ? 'font-semibold text-indigo-600' : 'text-slate-400')}>
      <span className="relative flex h-5 w-5 items-center justify-center">
        <t.icon className="h-5 w-5" />
        {(t as any).badge && <NotificationBadge count={unreadCount} />}
      </span>
      <span className="truncate max-w-[52px]">{t.label}</span>
    </NavLink>
  );

  return (
    <>
      {showMore && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setShowMore(false)}>
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
          <div className="absolute bottom-16 right-2 w-48 rounded-2xl border border-white/40 bg-white/90 p-2 shadow-2xl backdrop-blur-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-1 px-3 py-1 text-xs font-semibold text-slate-500">更多功能</div>
            {moreTabs.map(t => (
              <NavLink key={t.key} to={t.to(storeIdVal)} onClick={() => setShowMore(false)}
                className={({ isActive }) => 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ' + (isActive ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white/60')}>
                <t.icon className="h-4 w-4" />{t.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/80 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-end justify-around">
          {directTabs.map(t => navItem(t))}
          {moreTabs.length > 0 && (
            <button onClick={() => setShowMore(!showMore)} className="flex flex-shrink-0 flex-col items-center gap-0.5 px-1 py-2 pt-2.5 text-xs text-slate-400 min-w-[56px]">
              {showMore ? <X className="h-5 w-5 text-indigo-600" /> : <MoreHorizontal className="h-5 w-5" />}
              <span className="max-w-[52px] truncate">更多</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}
