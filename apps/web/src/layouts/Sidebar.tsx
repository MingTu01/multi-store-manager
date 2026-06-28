import { useState, useEffect } from 'react';
import { NavLink, useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../stores/data';
import { api } from '../lib/api';
import { NotificationBadge } from '../components/NotificationBadge';
import { useNotificationStore } from '../stores/notification';
import { useUnreadPolling } from '../hooks/useUnreadPolling';
import { canAccess } from '../lib/permissions';
import { LayoutDashboard, Store, Bell, Settings, Package, BookOpen, Users, BarChart3, Clock, FileText, DollarSign, Divide, LogOut, ChevronRight, ArrowLeft, Truck } from 'lucide-react';

import { getRoleLabel, getRoleBg, getRoleColor } from '../lib/role';

export function Sidebar() {
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const fetchUnread = useNotificationStore((s) => s.fetchUnread);
  useEffect(() => { fetchUnread(); const t = setInterval(fetchUnread, 30000); return () => clearInterval(t); }, [fetchUnread]);
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
    { to: '/store/' + storeId + '/purchase', icon: Truck, label: '进货', key: 'storePurchase' },
    { to: '/store/' + storeId + '/shifts', icon: Clock, label: '开闭店', key: 'storeShifts' },
    { to: '/store/' + storeId + '/notifications', icon: Bell, label: '消息通知', key: 'storeNotifications', badge: true },
    { to: '/store/' + storeId + '/inventory', icon: Package, label: '盘点', key: 'storeInventory' },
    { to: '/store/' + storeId + '/report', icon: BarChart3, label: '报表', key: 'storeReport' },
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
        <img src="/logo.png" alt="Logo" className="h-11 w-11 rounded-xl object-cover shrink-0"  loading="lazy" />
        <span className="rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 flex-1 px-4 py-2 text-base font-bold text-white animate-gradient-capsule text-center"><span className="animate-text-gradient">Multi Shop Link</span></span>
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
              {'badge' in n && n.badge && <NotificationBadge count={unreadCount} />}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/30 px-3 py-3">
        <div className="rounded-2xl animate-logo-border p-2 flex items-center justify-center">
          <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABfCAMAAACa5XhXAAABZVBMVEVMaXH9/f3X1tj///+CTrL////+/v724qb00pT+/PyZMIfKt263rKz39vf8+/r5+fmMRGT8/PzzyVk5ae/i4eH8/Pz1wVX6+fj9zVKVLoXyv1309PP08vP9/f3p6eq/NH339vb5+fn29vfz8/L8/Pv9yFndFk/6+vr5x1jv0F3j1mL29vZGbM/ozV/8x1imPJc5d+33xln8/Pw2bfU3b/WgNY83cPP7xVX8xlj5w1eeNJE0cOqcM4o0cPKbM43iG1L2x1g5dPLgG1I3cfOaNIqjOZL6w1j1ylryyV32ylvxyV78/Pz6+vnjG1KiN5M5cfUzc/KcMo7y8vP19fbhHVHhG1TgHFI4de3hG1T9/fy2LHLtoVn15b7///+TL4Q6a/M6a/GSLISVLIWVL4U8bfQ9b/faE1DWEk42Zew6bPY3aPGeMoz/y1j/0VzjF1E8c///11/sGlY0bv6iMpA7cPtAdP6oNpNT1IcoAAAAXXRSTlMA/BD7Av79AgED/g8IP+StBflM/izC7KXb/HU1ZO0ZIoOacUzV+fu2pjgZRBIn8Dook93z3a+61uG8iEPtnda7g3Ljj8ZUy2lfeFPMjINtz1+cV1tBU25RmE61X1vMBiKzAAAACXBIWXMAAB7CAAAewgFu0HU+AAAOJklEQVR4nO2c+VcaSRDHa2BmugcRIWgMq6AYBRONGjzXM55J1MTcyf7QMsIgAnIp5u/fV91zgSRudve9QF7q5ZAZAv2Zqm9VdU9PAH7bb/ttv802QuBXMELF7y43QoC8eAS0y1EoofDooDzx9HF3xxch8GTysnx/prby3N+9KIRAz7OZ2sqLx0+eTtSW73WpVAiKY7k286wHKIUnf5YvJ590oVQoisMePAbV4XJ55lnXSYWgOCZqB3Y4YZi97DqpED7q8v0/3KMWbOWD7knFlADcW76dcl3R1hVOIXy45T/bXHmu/xWu/45HIQQeY649JG3Hambk5UOts1FkAv7nK7WZlz1AtLZCkIOiRrZzWMcYJRTuHdTKk48h6CcA8u23yN3QtRAKTybLtYNHI6t7m5t7qyO3SWSY2106Wdqdg+f3hd86D4Vg9E/UHryA/a9fr0ul0vX6fiuJDNvzjVyhUNB35e8p6ScaJaCZ+WhkveRDi5TWW3wiw+dG+AItXN0AJ7dBxxh1KoQMi6VINuvzZbOR0iK45UxheqF4wUmK4avPINPDNtXmp4tjonxwj0IQZkunWW6n2Wxp1u0SGd40hD/CxXBjqfO6Fir6ET4eGVavIxzj9DQbuV5tBlkqXFgk6fk5kLHo8CuAH/LzjRwu15wI2StFMiaIr7Tpd94mw9y84OCxVd0GualHhp9uk+VLq7xRGFn3ZWwQnzu2ZNi+coNs8FOEgP/FyuXEIfzk6KKgPbh8Sk13yLB/zVOWL4scvq9NsWVF1sVFuFhsLATFOYyv5cuXHQCyPPHEGgVKxJfJYM7KYupyxRZGVtF0x0WxmDZQJOKUH56X//j5IOTB/R4rwiksIkhGRFc2m3Fiy4ms4kUxrKeN6hvrFIF7HQYiC4k4IK68JcPSVZEnrGJR13VDN0UiQC47DWS2xEFEAs5mI75NvzjHIwsZ0kY6reuGoVdPZJOkE0FWryPCIZlMBgvjqW9WjBAjq5jW9XShUEgbRi5nFNJzHQsC2J9kstkMJl/0SDZSMmOLR5YuQAoIkjOqnzsVhML0us+XEUUEQU5PrdgSkYUghgli5IxWj1DNnoxpmqa1kBE81vLl/G38D9py9Jbhp/G30tuf0Aoiw+w1T7zCIWjZrIgtGbarmKz0tGEUcmjGzVKL2ClW1OYu87vWjNXK/aPWDPKagwgGk8Tq5Zca4bAA4Rw548adfrlHPA//8uAnUfBM9fZODTUPrX+qd6rXaXmwAnumho/jg/H46Pshv7WARiE21XvbpoaAwhB+LP8Ka/AePNUvvtQdWryFd3NESm9xuDyykEM3CgLEyC1MW58oQCA2wNhRDChQ8A8wVWHvwLnmBPqYl0XxtPma9MYDCuOmMCV13C+6Cw3+YuZhl6lsAAjwT51yPpXAkMq8bBBjxgVCoWfdF7FCyiTx8Yoow3aDR5ZuBlbOuNkFuRlklHm97Bi/hkB/lHlZIOY0OAgisYB1OTUYSuL4pRA3SVFYKB7DASGIZJqiKIoqqaqqSiaIV2G9TSCSchsEq4gFYHPsaThezFkX4bBuWArJ5XJzrSCDCJLk2UuDMXzR50QBgoRsEA2GQ0z1SpJ57SVJ9SpsvB+I2yOqoljvsDziVVtAQqrUBuT1dSTLGWyhlF67IgsbE0siN0vYKve4QYaZqrIx8TUUkq5XrSAEhpniVSSVKamBvuRRVAyajcdw4jyVGhcWYoqkBsTPqUErtFpAlHYgizipOnWDrI8AzM0BbDfCqBGbI3fzBoLw6oNo5YXYteNoNK6JS86DS2FRvMa3QAi8UxVVkVgo3osH5NjwEZMUJpkuDAqDJHpqyH5J24FIzAbRTBAK/s1SJOPmiPgWIQjbuzxn6agQK7JuFqYBenY+uUEoxCwtUwwejIMBs8Nxg1CIBZikSOwIM5FIVsExVVFYi5L7mKRK9qX4Foi3FUSGWeyzztxaL+GK0MkCzM2nBYfpEeNmA4Lwsf7FDdKc1Sn0MdXLRs2vNUGQVMO0oEgs6bFKCdW4qBTTJfS/gQRRIpmzs7MzS+uR7GYPwFruam27qqdNEE5iNNYgCFv1HXS4BUL8fj8uUAKFfkxA/LqHzGvseISCf5ypEhv3uLIz1SCOo3Ri8b94ZPH6zASxisgqBGG3WpyfL6TdIMbNiUxhJFFJ8Gppiv19YHw8gLVDg/dxIBq8Z4qK46U2SMqDQ+5liqqqrigSokpFo9GQU3tEwv5xEC6RTObsTASXIJkFmF4oFAuFYjotuncTZBulXknUP7pAeMYd5iAP2UPsOQaZV2Jx/sWOR3hkSWaedkejJ+bxxDwutH8HYs9FHI/49qgMb6rFYjHNZyHptBVa83MAwZ3zhBCJAyLZIKkYaBBLYQ7mF5lAUoDImJklib13Bxb+bu3MyL8GQYkgh0USKb2GICxVi2nMVoVCWoAYhn6zhFI/z+crWzyBtwHBT8e/FQUVTnhh4SAEguNMUl1isIeFRv8HEJyLWBxnOKfiRWS+YM1CBId+kwvzIvKlks+fc5G0A+E/EVSwypJAqfBICkE8UaZytbSA/E8egeCmLyPEjmlrb89X4kWkiuowPYIcxsYJLyIjO/l8/pyLpJ1GVExAGnjGUfBjyGRqhEDPcTweH7MG50kOuOxotDlr/TiIqCIcA0F8s/slUUSqKI5CAae26UJBzy3ANi8inyr5fD5ff+UGkRyPKLyEaDCF/WB0CLSmXss2GWLYAThN7uD3QaR/AGJVEe6Q9enp9XUsIjh+5MihRwoFvbEBn6u8iHAQFEl7EInXQg2OMbgG/NQFYs/qmkBEkzv470FEryXD25INEvHtASxiZO1WdYysXM7gHknrhTWYW8LISiBHvrIzgn3ebRCzqFPwHAnvtPcIBQ8GWjwe70MciQ1+v47cCULAjxKxPFJaBdjfB/CfNHjO4oYgjYVpmF4DYkaWEMl3QECD3hBTFGmqPYgDNIYJTmoFaa3sUuvESmkBkWGEN1qWRPZBDgZlWEMOs6IbaT0dru6acyURWfkEiuQ7oYUkvP6N+we/AYKBBrE+HmBSa2g1g/CpwV8OiAZT6G43SBBel04dseNEHTPyRhV7RR5dhqHreriwBjLIMnwQkZXP17ewS/uW2PnX47xXZcnUtzxCcArCVEVtA6K4QLBTUFWzUzBBRrFr40dskLdYDk0QlIi41VZoAgnjRJ1PtF5Vzs8xss5RJN8F4bMfpigKfmVbj4A2qjKv2tYjigsEhy2pOO83STTsSxVJTN9MEAhulswicnaGEuHD/dwo8maRRxc6BCfq+G+COxzk/Pw8UflwBwif96piCngbhGrQP8BUyctSw9G7QHqZoqisTxMLXAQ8A3iFpCFXaMGIlbI4CL8xzSPL5OAWDucwskCGD5Vz0yMokjtAAEiSqYy1AyEE3keZV1JZXwxSlnDbg1DwHzGVKSzJ138AhvAlLkuIswJkv+QCiWDjIcP0fMHFYeh6bsEvQL7UE5ZH6lt3gpjzXvcqin2RPXGmeL0sNAbgvwMEpwe4jCKxUPJ4dPT4SOLrMNhou0DeliI2iG9TnJleaFggBv/liiwbBEVyl0dEcDG1BYRqMDTOvJjTsPTfCQIU4jh/Vq3lMBV1d2wtyok6sucCEYtyTtKyRdLgkQUybNUTguM8Ual8sEFCDojXSr/mCJLMq3ibW0UCMBbC9QUW94BGEURqAQlJoWYQ/yBTVK/k9Xpx3QszRDxoneMgI+vZrBVYZ2INCLCMuBRi6LkTnrNwToWhxa1SqX+CNk1jk0fM4FKaPEIhxtfoWPQdSoW284iXqU3tPqXycAqjVJFUCVcoU8OyOZGhQPAe4n4pYoKcnmW4RERs5dxaF5FliV14hIuE30OE4VAgEML5kgZT0UAg5ALBRZVoIBA9ckAo9I6HAoFANNmP7sCm7ygaCMVdIPFoIBBonrdQAp53fSkOIaX63nnsHbwU/A/KT/lcRBRE+06CiC0r/aKJnMXXVncq54KDVxJxV9fv8Xg8YpVac360nYKHPG6px2L8EIIL86C53sA/sHX6hW/29z98+HCqH7/APe+fvKw9x3KId6nOTrPmurXYRHPlgFjVkNsWqh0tf56of5gs332f/ZvTqB/dlEOdGxAtm+Po4f1nfBle3D3EGa4FMr3QsCuJ02dhZTdFgu1W5ePkn3znA6X2xBt/bC19rYf465jLb0S7/Ya2/PTWzSFxGB4/2UOQrLiZG3Hdkt64Chd1fmNED1/ZN0SsisiFkqh87LHWE3/c/D9wZ+hOIwQ7Lb7fwefzlXijxU2GN1fFdFhYet6+IUJB3qrkkQJr+85Ih+wOArEUFEEKn8937WycE7GFHgmHrc0n5olPvJKgQ+qfwEzlHWAyrH4VGKWvi03H1+avOEbx6sR2CFpwq55IJBKYfbEGdIxRebX09fr6+uv6alOgyLC2cMVtyc1BZBjZqtTr9frOF+fedkeYDLNvFxf3VmefNT8nIoP/zcbSxu6aaymQ7+Ncefnx1atXn/gMrKNMxj8IPFoxH7Wwj1uZyhqvzJ8rKV9OilTVaRwAskyBBsH/x/3yjHvHpSzLVLZw7D1zB49wVh8MdhyGZVTsjf/Wjktz6/zKi+DP3rJxp5mXnO+4bPO0Qs9L3B3cQVtk79rMvFyeaJKKEId8iOJoOd7BRsTDFU3PiQhPXV6281QHGxHPIa28sDa/C3GYu4Ohi4wSwIcrzOdEcFPs8xW+f1zuKgw0MfjaxORjrBf3Dmr27uCuM4LhNFObefn40WS5tnxIu0kcbbb/X9ZmJjr1qZd/bJQAbfcoXxcaIdDzCzzP/gv9DwOA8dXlUfXbfttvg1/G/gb0ynhnZGFS7wAAAABJRU5ErkJggg==" alt="Mingtu" className="w-full max-h-32 object-contain rounded-xl"  loading="lazy" />
        </div>
      </div>
      <div className="border-t border-white/30 p-3 space-y-2">
        <button onClick={() => navigate(storeId ? '/store/' + storeId + '/account' : '/admin-settings')} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-600 hover:bg-white/60 transition-all">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600 shrink-0 overflow-hidden">
            {user?.avatar ? <img src={user.avatar} className="h-full w-full object-cover" alt=""  loading="lazy" /> : (user?.name?.[0] || '用')}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-sm font-medium text-slate-800 truncate">{user?.name}</div>
            <div className="text-xs text-slate-400"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${getRoleBg(user?.role)} ${getRoleColor(user?.role)}`}>{getRoleLabel(user?.role)}</span></div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </div>
    </aside>
  );
}
