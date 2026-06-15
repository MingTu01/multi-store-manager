import { useEffect, useState } from 'react';
import { useDataVersion } from '../../stores/data-sync';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../stores/data';
import { GlassCard } from '../../components/GlassCard';
import { MoneyDisplay, formatMoney } from '../../lib/format';
import { TrendingUp, TrendingDown, DollarSign, BookOpen, Package, Clock, BarChart3, ChevronRight, ArrowLeft } from 'lucide-react';

export default function StoreOverviewPage() {
  const { storeId } = useParams();
  const dataVersion = useDataVersion('store', storeId);  const nav = useNavigate();
  const user = useStore((s) => s.user);
  const isAdmin = user?.role === 'ADMIN';
  const isNonAdmin = user?.role !== 'ADMIN';
  const [store, setStore] = useState<any>(null);
  const [today, setToday] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then(setStore).catch(() => {});
    api.get('/stores/' + storeId + '/entries?period=day').then((d: any) => {
      const entries = d.entries || d.data || [];
      const inc = entries.filter((e: any) => e.type === '收入' || e.type === 'income').reduce((s: number, e: any) => s + e.amount, 0);
      const exp = entries.filter((e: any) => e.type === '支出' || e.type === 'expense').reduce((s: number, e: any) => s + e.amount, 0);
      setToday({ income: inc, expense: exp, profit: inc - exp });
    }).catch(() => {});
    api.get('/stores/' + storeId + '/entries?limit=5').then((d: any) => setRecent(d.entries || (Array.isArray(d) ? d : []).slice(0, 5))).catch(() => {});
  }, [storeId, dataVersion]);

  if (!store) return <div className="flex h-32 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" /></div>;

  const metrics = [
    { label: '今日收入', value: today?.income || 0, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: TrendingUp },
    { label: '今日支出', value: today?.expense || 0, color: 'text-rose-600', bg: 'bg-rose-50', icon: TrendingDown },
    { label: '今日利润', value: today?.profit || 0, color: today?.profit >= 0 ? 'text-indigo-600' : 'text-rose-600', bg: 'bg-indigo-50', icon: DollarSign },
  ];
  const visibleMetrics = isNonAdmin ? metrics.filter(m => m.label !== '今日利润') : metrics;

  const quickActions = [
    { label: '记账', icon: BookOpen, to: '/store/' + storeId + '/entries', key: 'storeEntries', openModal: true },
    { label: '盘点', icon: Package, to: '/store/' + storeId + '/inventory', key: 'storeInventory' },
    { label: '报表', icon: BarChart3, to: '/store/' + storeId + '/report', key: 'storeReport' },
    { label: '开闭店', icon: Clock, to: '/store/' + storeId + '/shifts', key: 'storeShifts' },
  ];

  return (
    <div className="space-y-4">
      {/* Header with store name and mobile back button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => nav('/')} className="flex items-center gap-1 rounded-lg bg-white/80 px-2 py-1 text-xs text-indigo-600 shadow-sm backdrop-blur-sm lg:hidden">
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          )}
          <h1 className="text-lg font-bold text-slate-900">{store.name}</h1>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${store.is_open === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
          {store.is_open === 1 ? '营业中' : '已关闭'}
        </span>
      </div>
      {store.address && <div className="text-xs text-slate-400 -mt-2">{store.address}</div>}

      {/* Today metrics */}
      <div className={`grid gap-3 ${isNonAdmin ? "grid-cols-2" : "grid-cols-3"}`}>
        {visibleMetrics.map((m) => (
          <GlassCard key={m.label} className="p-3 text-center">
            <div className="text-[10px] text-slate-400 mb-1">{m.label}</div>
            <MoneyDisplay value={m.value} className={`text-lg font-bold ${m.color}`} />
          </GlassCard>
        ))}
      </div>

      {/* Quick actions */}
      <GlassCard className="p-4">
        <h3 className="mb-3 text-xs font-semibold text-slate-500">快捷操作</h3>
        <div className="grid grid-cols-4 gap-2">
          {quickActions.map((a) => (
            <button key={a.key} onClick={() => nav(a.to, a.openModal ? { state: { openModal: true } } : undefined)} className="flex flex-col items-center gap-1.5 rounded-xl py-3 text-xs text-slate-600 hover:bg-slate-50 transition-all">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50"><a.icon className="h-5 w-5 text-indigo-500" /></div>
              {a.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Recent entries */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-500">最近记账</h3>
          <button onClick={() => nav('/store/' + storeId + '/entries')} className="text-xs text-indigo-500">查看全部 <ChevronRight className="inline h-3 w-3" /></button>
        </div>
        {recent.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">暂无记录</div>
        ) : (
          <div className="space-y-2">
            {recent.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div>
                  <div className="text-xs font-medium text-slate-700">{e.category}</div>
                  <div className="text-[10px] text-slate-400">{e.date}</div>
                </div>
                <span className={`text-xs font-bold ${(e.type === "收入" || e.type === "income") ? "text-emerald-600" : "text-rose-500"}`}>
                  {(e.type === '收入' || e.type === 'income') ? '+' : '-'}{formatMoney(e.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
