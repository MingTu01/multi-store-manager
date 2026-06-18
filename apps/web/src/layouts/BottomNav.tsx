import { useState, useEffect } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useStore } from '../stores/data';
import { canAccess } from '../lib/permissions';
import { api } from '../lib/api';
import { NotificationBadge } from '../components/NotificationBadge';
import { useNotificationStore } from '../stores/notification';
import { LayoutDashboard, Store, Bell, Settings, BookOpen, Package, Clock, BarChart3, Users, DollarSign, Divide, FileText, MoreHorizontal, X, User, ArrowLeft } from 'lucide-react';

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

  if (storeId && storeOpen === false) {
    if (user?.role === 'ADMIN') {
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

  const adminTabs = [
    { to: '/', icon: LayoutDashboard, label: '仪表盘', key: 'dashboard' },
    { to: '/stores', icon: Store, label: '门店', key: 'stores' },
    { to: '/notifications', icon: Bell, label: '通知', key: 'notifications', badge: true },
    { to: '/upgrade', icon: Settings, label: '设置', key: 'upgrade' },
    { to: '/admin-settings', icon: User, label: '我的', key: 'adminSettings' },
  ];

  const storeMainTabs = [
    { to: '/store/' + storeId, icon: LayoutDashboard, label: '总览', key: 'storeOverview', end: true },
    { to: '/store/' + storeId + '/entries', icon: BookOpen, label: '记账', key: 'storeEntries' },
    { to: '/store/' + storeId + '/inventory', icon: Package, label: '盘点', key: 'storeInventory' },
    { to: '/store/' + storeId + '/shifts', icon: Clock, label: '开闭店', key: 'storeShifts' },
    { to: '/store/' + storeId + '/account', icon: User, label: '我的', key: 'storeAccount' },
  ];

  const storeMoreTabs = [
    { to: '/store/' + storeId + '/notification-settings', icon: Settings, label: '消息推送', key: 'storeAdminSettings' },
    { to: '/store/' + storeId + '/notifications', icon: Bell, label: '通知', key: 'storeNotifications', badge: true },
    { to: '/store/' + storeId + '/report', icon: BarChart3, label: '报表', key: 'storeReport' },
    { to: '/store/' + storeId + '/staff', icon: Users, label: '员工', key: 'storeStaff' },
    { to: '/store/' + storeId + '/payroll', icon: DollarSign, label: '工资', key: 'storePayroll' },
    { to: '/store/' + storeId + '/dividends', icon: Divide, label: '分红', key: 'storeDividends' },
    { to: '/store/' + storeId + '/logs', icon: FileText, label: '日志', key: 'storeLogs' },
    { to: '/store/' + storeId + '/settings', icon: Settings, label: '设置', key: 'storeSettings' },
  ];

  const allTabs = storeId ? storeMainTabs : adminTabs;
  const filteredMain = allTabs.filter(t => canAccess(t.key as any, role));
  const filteredMore = storeId ? storeMoreTabs.filter(t => canAccess(t.key as any, role)) : [];

  const navItem = (t: any) => (
    <NavLink key={t.to} to={t.to} end={'end' in t && t.end === true ? true : undefined} onClick={() => setShowMore(false)}
      className={({ isActive }) => 'flex flex-shrink-0 flex-col items-center gap-0.5 py-2 pt-2.5 text-xs transition-colors min-w-[56px] px-1 ' + (isActive ? 'font-semibold text-indigo-600' : 'text-slate-400')}>
      <span className="relative flex h-5 w-5 items-center justify-center">
        <t.icon className="h-5 w-5" />
        {t.badge && <NotificationBadge count={unreadCount} />}
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
            {filteredMore.map(t => (
              <NavLink key={t.to} to={t.to} onClick={() => setShowMore(false)}
                className={({ isActive }) => 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ' + (isActive ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white/60')}>
                <t.icon className="h-4 w-4" />{t.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/60 bg-white/80 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-end justify-around">
          {filteredMain.map(t => navItem(t))}
          {filteredMore.length > 0 && (
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
