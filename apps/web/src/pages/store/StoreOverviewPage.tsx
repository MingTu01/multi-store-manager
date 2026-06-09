import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { MoneyDisplay } from '../../lib/format';
import { TrendingUp, TrendingDown, DollarSign, BookOpen, Package, Clock, BarChart3, ChevronRight } from 'lucide-react';

export default function StoreOverviewPage() {
  const { storeId } = useParams();
  const nav = useNavigate();
  const [store, setStore] = useState<any>(null);
  const [today, setToday] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => setStore(d)).catch(() => {});
    api.get('/stores/' + storeId + '/today').then(setToday).catch(() => {});
    api.get('/stores/' + storeId + '/entries?period=day&limit=5').then((d) => setRecent(d.entries || [])).catch(() => {});
  }, [storeId]);

  const income = today?.income ?? 0;
  const expense = today?.expense ?? 0;
  const profit = income - expense;

  const actions = [
    { icon: BookOpen, label: '记账', to: '/store/' + storeId + '/entries', color: 'bg-indigo-50 text-indigo-600' },
    { icon: Package, label: '盘点', to: '/store/' + storeId + '/inventory', color: 'bg-emerald-50 text-emerald-600' },
    { icon: Clock, label: '开闭店', to: '/store/' + storeId + '/shifts', color: 'bg-amber-50 text-amber-600' },
    { icon: BarChart3, label: '报表', to: '/store/' + storeId + '/report', color: 'bg-violet-50 text-violet-600' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{store?.name || '门店'}</h1>
        <p className="text-sm text-slate-500">今日经营概况</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '收入', value: income, icon: TrendingUp, color: 'text-emerald-600' },
          { label: '支出', value: expense, icon: TrendingDown, color: 'text-rose-600' },
          { label: '利润', value: profit, icon: DollarSign, color: profit >= 0 ? 'text-indigo-600' : 'text-rose-600' },
        ].map((c) => (
          <GlassCard key={c.label} className="p-4 text-center">
            <div className="mb-1 text-xs text-slate-500">{c.label}</div>
            <MoneyDisplay value={c.value} className={'text-lg ' + c.color} />
          </GlassCard>
        ))}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">快捷操作</h3>
        <div className="grid grid-cols-4 gap-2">
          {actions.map((a) => (
            <button key={a.label} onClick={() => nav(a.to)}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/60 p-3 backdrop-blur-sm transition-all hover:shadow-md">
              <div className={'flex h-10 w-10 items-center justify-center rounded-xl ' + a.color}>
                <a.icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-slate-700">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">最近记账</h3>
          <button onClick={() => nav('/store/' + storeId + '/entries')} className="flex items-center gap-0.5 text-xs text-indigo-500">
            查看全部 <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {recent.length === 0 ? (
          <GlassCard className="py-8 text-center text-sm text-slate-400">今日暂无记账</GlassCard>
        ) : (
          <GlassCard className="divide-y divide-slate-100">
            {recent.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm text-slate-800">{e.category}</div>
                  <div className="text-xs text-slate-400">{e.note || e.created_at}</div>
                </div>
                <MoneyDisplay value={e.amount} className={'text-sm ' + (e.type === '收入' ? 'text-emerald-600' : 'text-rose-500')} />
              </div>
            ))}
          </GlassCard>
        )}
      </div>
    </div>
  );
}
