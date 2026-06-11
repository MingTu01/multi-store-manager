import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { MoneyDisplay, formatMoney } from '../../lib/format';
import { PeriodTabs, type Period } from '../../components/PeriodTabs';
import { useStore } from '../../stores/data';
import { TrendingUp, TrendingDown, DollarSign, Percent, Store, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];

const fmtMoney = (v: any) => '\u00a5' + Number(v).toLocaleString();
const pctStr = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(new Date());
  const [stats, setStats] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [trend, setTrend] = useState<any[]>([]);
  const nav = useNavigate();

  const dateStr = date.toISOString().split('T')[0];
  useEffect(() => {
    api.get('/dashboard?period=' + period + '&date=' + dateStr).then(setStats).catch(() => {});
    api.get('/stores').then((d: any) => setStores(d.stores || (Array.isArray(d) ? d : []))).catch(() => {});
    api.get('/dashboard/trend?period=' + period).then((d: any) => setTrend(d.trend || [])).catch(() => {});
  }, [period, dateStr]);

  const income = stats?.income ?? 0;
  const expense = stats?.expense ?? 0;
  const profit = income - expense;
  const margin = income > 0 ? (profit / income) : 0;
  const incomeByCategory = stats?.incomeByCategory || [];
  const expenseByCategory = stats?.expenseByCategory || [];
  const comp = stats?.comparison;
  const yoy = stats?.yoy;
  const storeData = stats?.stores || [];

  const compData = comp ? [
    { label: '本期', income: comp.current?.income || 0, expense: comp.current?.expense || 0 },
    { label: '上期', income: comp.previous?.income || 0, expense: comp.previous?.expense || 0 },
  ] : [];

  const yoyInc = yoy?.incomeChange !== undefined ? income / (1 + (yoy.incomeChange || 0)) : 0;
  const yoyExp = yoy?.expenseChange !== undefined ? expense / (1 + (yoy.expenseChange || 0)) : 0;
  const yoyData = [
    { label: '本期', income, expense },
    { label: '去年同期', income: Math.max(0, yoyInc), expense: Math.max(0, yoyExp) },
  ];

  const userRole = useStore((s: any) => s.user?.role);
  const isAdmin = userRole === 'ADMIN' || userRole === 'admin';
  const fundBalance = stats?.fundBalance ?? 0;

  const metrics = [
    ...(isAdmin ? [{ label: '资金余额', value: fundBalance, icon: DollarSign, color: fundBalance >= 0 ? 'text-sky-600' : 'text-rose-600', bg: 'bg-sky-50', change: undefined, yoyChange: undefined }] : []),
    { label: '收入', value: income, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', change: comp?.changes?.incomeChange, yoyChange: yoy?.incomeChange },
    { label: '支出', value: expense, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50', change: comp?.changes?.expenseChange, yoyChange: yoy?.expenseChange },
    { label: '净利润', value: profit, icon: DollarSign, color: profit >= 0 ? 'text-indigo-600' : 'text-rose-600', bg: 'bg-indigo-50', change: comp?.changes?.profitChange, yoyChange: yoy?.profitChange },
    { label: '利润率', value: margin * 100, icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50', suffix: '%', change: comp?.changes?.marginChange, yoyChange: yoy?.marginChange },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="仪表盘" subtitle="经营数据总览" />
      <PeriodTabs period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((c) => (
          <GlassCard key={c.label} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-500">{c.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
            </div>
            <div className="flex items-baseline">
              {c.suffix ? (
                <span className={`text-2xl font-bold tracking-wide ${c.color}`}>{c.value.toFixed(1)}{c.suffix}</span>
              ) : (
                <MoneyDisplay value={c.value} className={`text-2xl ${c.color}`} />
              )}
            </div>
            <div className="mt-1 flex gap-3">
              {c.change !== undefined && (
                <span className={`text-xs ${c.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>环比 {pctStr(c.change)}</span>
              )}
              {c.yoyChange !== undefined && (
                <span className={`text-xs ${c.yoyChange >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>同比 {pctStr(c.yoyChange)}</span>
              )}
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {[
          { title: '收入构成', data: incomeByCategory },
          { title: '支出构成', data: expenseByCategory },
        ].map((section) => (
          <GlassCard key={section.title} className="p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">{section.title}</h3>
            {section.data.length > 0 ? (
              <div className="flex items-center gap-4">
                <div style={{ width: '55%', height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={section.data} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                        {section.data.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => '\u00a5' + Number(v).toLocaleString()} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-1.5">
                  {section.data.map((item: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 truncate text-slate-600">{item.category}</span>
                      <span className="font-medium text-slate-800 shrink-0">{formatMoney(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">暂无数据</div>
            )}
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">环比对比</h3>
          {compData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={compData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={fmtMoney} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" fill="#22c55e" name="收入" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill="#f43f5e" name="支出" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">暂无数据</div>}
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">同比对比</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={yoyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={fmtMoney} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" fill="#6366f1" name="收入" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#f59e0b" name="支出" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      <div>
      {trend.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">趋势对比</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(trend.length / 10))} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={fmtMoney} />
              <Legend />
              <Bar dataKey="income" fill="#6366f1" name="收入" radius={[2, 2, 0, 0]} />
              <Bar dataKey="expense" fill="#f43f5e" name="支出" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      )}
        <h3 className="mb-3 text-sm font-semibold text-slate-700">门店概览</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(storeData.length > 0 ? storeData : stores).map((s: any) => {
            const si = s.income ?? s.todayIncome ?? 0;
            const se = s.expense ?? s.todayExpense ?? 0;
            const sp = s.profit ?? (si - se);
            const sm = s.margin ?? (si > 0 ? sp / si : 0);
            const pieData = [
              { name: '收入', value: Math.max(0, si) },
              { name: '支出', value: Math.max(0, se) },
            ];
            return (
              <GlassCard key={s.id} className="cursor-pointer p-4 transition-all hover:shadow-xl" onClick={() => nav('/store/' + s.id)}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-600">{s.name?.[0] || '店'}</div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                      <div className="text-xs text-slate-400">{s.address || ''}</div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${s.is_open === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {s.is_open === 1 ? '营业中' : '已关闭'}
                  </span>
                </div>
                {(si > 0 || se > 0) && (
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart><Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={30} innerRadius={18}><Cell fill="#22c55e" /><Cell fill="#f43f5e" /></Pie></PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid flex-1 grid-cols-3 gap-2 text-center">
                      <div><div className="text-[10px] text-slate-400">收入</div><MoneyDisplay value={si} className="text-xs text-emerald-600" /></div>
                      <div><div className="text-[10px] text-slate-400">支出</div><MoneyDisplay value={se} className="text-xs text-rose-500" /></div>
                      <div><div className="text-[10px] text-slate-400">利润</div><MoneyDisplay value={sp} className={`text-xs ${sp >= 0 ? 'text-indigo-600' : 'text-rose-500'}`} /></div>
                    </div>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">员工 {s.staff_count ?? 0}</span>
                    <span className="text-xs text-slate-400">利润率 {(sm * 100).toFixed(1)}%</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
              </GlassCard>
            );
          })}
          {(storeData.length === 0 && stores.length === 0) && (
            <GlassCard className="col-span-full py-12 text-center text-sm text-slate-400"><Store className="mx-auto mb-2 h-8 w-8" />暂无门店</GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}