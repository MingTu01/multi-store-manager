import { useEffect, useState } from 'react';
import { useDataVersion } from '../../stores/data-sync';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { PeriodTabs, usePageSwipe, type Period } from '../../components/PeriodTabs';
import { MoneyDisplay } from '../../lib/format';
import { useStore } from '../../stores/data';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LineChart, Line } from 'recharts';
import { ChartModal } from '../../components/ChartModal';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const fmtMoney = (v: any) => '¥' + Number(v).toLocaleString();
const pctStr = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

const renderCustomLabel = ({ category, percent }: any) => {
  if (percent < 0.05) return null;
  return category + ' ' + (percent * 100).toFixed(0) + '%';
};

function PieLegend({ data, color }: { data: any[]; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {data.map((item: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
          <span className="text-xs text-slate-600 truncate">{item.category}</span>
          <span className="ml-auto text-xs font-medium" style={{ color }}>{fmtMoney(item.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export default function StoreReportPage() {
  const { storeId } = useParams();
  const dataVersion = useDataVersion('store', storeId);
  const role = useStore((s) => s.user?.role) as string | undefined;
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(new Date());

    const swipeHandlers = usePageSwipe(
    () => { const d = new Date(date); if (period === 'day') d.setDate(d.getDate() + 1); else if (period === 'week') d.setDate(d.getDate() + 7); else if (period === 'month') d.setMonth(d.getMonth() + 1); else if (period === 'year') d.setFullYear(d.getFullYear() + 1); setDate(d); },
    () => { const d = new Date(date); if (period === 'day') d.setDate(d.getDate() - 1); else if (period === 'week') d.setDate(d.getDate() - 7); else if (period === 'month') d.setMonth(d.getMonth() - 1); else if (period === 'year') d.setFullYear(d.getFullYear() - 1); setDate(d); }
  );
  const [data, setData] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [trendDays, setTrendDays] = useState(7);
  const hideYearAll = role === 'MANAGER' || role === 'STAFF';

  const dateStr = date.toISOString();
  useEffect(() => {
    if (!storeId) return;
    const d = dateStr.split('T')[0];
    api.get('/stores/' + storeId + '/report?period=' + period + '&date=' + d).then(setData).catch(() => {});
    api.get('/stores/' + storeId).then((d) => setStore(d)).catch(() => {});
    api.get('/dashboard/trend?period=' + period + '&storeId=' + storeId + '&days=' + trendDays).then((d: any) => setTrend(d.trend || [])).catch(() => {});
  }, [storeId, period, date, trendDays]);

  const income = data?.income ?? 0;
  const expense = data?.expense ?? 0;
  const profit = income - expense;
  const margin = income > 0 ? (profit / income) : 0;
  const incomeByCategory = data?.incomeByCategory || [];
  const expenseByCategory = data?.expenseByCategory || [];
  const comp = data?.comparison;
  const fundBalance = data?.fundBalance ?? 0;
  const isAdmin = role === 'ADMIN' && period === 'all';
  const yoy = data?.yoy;

  const compData = comp ? [
    { label: '本期', income: comp.current?.income || 0, expense: comp.current?.expense || 0 },
    { label: '上期', income: comp.previous?.income || 0, expense: comp.previous?.expense || 0 },
  ] : [];

  const yoyData = yoy ? [
    { label: '本期', income, expense },
    { label: '去年同期', income: Math.max(0, income / (1 + (yoy.incomeChange || 0))), expense: Math.max(0, expense / (1 + (yoy.expenseChange || 0))) },
  ] : [];

  const metrics = [
    ...(isAdmin ? [{ label: '资金余额', value: fundBalance, icon: DollarSign, color: fundBalance >= 0 ? 'text-sky-600' : 'text-rose-600', bg: 'bg-sky-50', change: undefined, yoyChange: undefined }] : []),
    { label: '收入', value: income, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', change: comp?.changes?.incomeChange, yoyChange: yoy?.incomeChange },
    { label: '支出', value: expense, icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50', change: comp?.changes?.expenseChange, yoyChange: yoy?.expenseChange },
    { label: '净利润', value: profit, icon: DollarSign, color: profit >= 0 ? 'text-indigo-600' : 'text-rose-600', bg: 'bg-indigo-50', change: comp?.changes?.profitChange, yoyChange: yoy?.profitChange },
    { label: '利润率', value: margin * 100, icon: Percent, color: 'text-amber-600', bg: 'bg-amber-50', suffix: '%', change: comp?.changes?.marginChange, yoyChange: yoy?.marginChange },
  ];

  return (
    <div className="space-y-4" {...swipeHandlers}>
      <PageHeader title={(store?.name || '') + ' 报表'} subtitle="经营数据" />
      <PeriodTabs period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} hideYearAll={hideYearAll} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((c) => (
          <GlassCard key={c.label} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-500">{c.label}</span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${c.bg}`}><c.icon className={`h-4 w-4 ${c.color}`} /></div>
            </div>
            <div className="flex items-baseline">
              {c.suffix ? <span className={`text-2xl font-bold tracking-wide ${c.color}`}>{c.value.toFixed(1)}{c.suffix}</span> : <MoneyDisplay value={c.value} className={`text-2xl ${c.color}`} />}
            </div>
            <div className="mt-1 flex gap-3">
              {c.change !== undefined && <span className={`text-xs ${c.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>环比 {pctStr(c.change)}</span>}
              {c.yoyChange !== undefined && <span className={`text-xs ${c.yoyChange >= 0 ? 'text-blue-500' : 'text-orange-500'}`}>同比 {pctStr(c.yoyChange)}</span>}
            </div>
          </GlassCard>
        ))}
      </div>

      {/* 收支构成 - 饼图 + 右侧图例 */}
      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="p-4">
          <ChartModal title="收入构成">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">收入构成</h3>
          {incomeByCategory.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart><Pie data={incomeByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={false}>
                  {incomeByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip formatter={fmtMoney} /></PieChart>
              </ResponsiveContainer>
              <div className="flex-1"><PieLegend data={incomeByCategory} color="#22c55e" /></div>
            </div>
          ) : <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">暂无数据</div>}
          </ChartModal>
        </GlassCard>
        <GlassCard className="p-4">
          <ChartModal title="支出构成">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">支出构成</h3>
          {expenseByCategory.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart><Pie data={expenseByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={false}>
                  {expenseByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie><Tooltip formatter={fmtMoney} /></PieChart>
              </ResponsiveContainer>
              <div className="flex-1"><PieLegend data={expenseByCategory} color="#ef4444" /></div>
            </div>
          ) : <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">暂无数据</div>}
          </ChartModal>
        </GlassCard>
      </div>

      {/* 环比同比 - 左右排列 */}
      <div className="grid gap-3 lg:grid-cols-2">
        {compData.length > 0 && (
          <GlassCard className="p-4">
            <ChartModal title="环比对比"><h3 className="mb-3 text-sm font-semibold text-slate-700">环比对比</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={compData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={40} tickLine={false} axisLine={false} /><Tooltip formatter={fmtMoney} /><Legend /><Bar dataKey="income" fill="#6366f1" name="收入" radius={[4, 4, 0, 0]} /><Bar dataKey="expense" fill="#f43f5e" name="支出" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
</ChartModal>
          </GlassCard>
        )}
        {yoyData.length > 0 && (
          <GlassCard className="p-4">
            <ChartModal title="同比对比"><h3 className="mb-3 text-sm font-semibold text-slate-700">同比对比</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yoyData}><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="label" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} width={40} tickLine={false} axisLine={false} /><Tooltip formatter={fmtMoney} /><Legend /><Bar dataKey="income" fill="#22c55e" name="收入" radius={[4, 4, 0, 0]} /><Bar dataKey="expense" fill="#f59e0b" name="支出" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
</ChartModal>
          </GlassCard>
        )}
      </div>

      {trend.length > 0 && (
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold text-slate-700">趋势对比</h3><div className="flex gap-1">{[7,14,30].map(d=>(<button key={d} onClick={()=>setTrendDays(d)} className={"rounded-md px-2 py-0.5 text-[10px] font-medium "+(trendDays===d?"bg-indigo-100 text-indigo-700":"text-slate-400 hover:bg-slate-100")}>{d}天</button>))}</div></div>
          <ChartModal title="趋势对比" extra={<div className="flex gap-1">{[7,14,30].map(d=>(<button key={d} onClick={()=>setTrendDays(d)} className={"rounded-md px-2 py-0.5 text-[10px] font-medium "+(trendDays===d?"bg-indigo-100 text-indigo-700":"text-slate-400 hover:bg-slate-100")}>{d}天</button>))}</div>}><ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(trend.length / 10))} />
              <YAxis tick={{ fontSize: 10 }} width={40} tickLine={false} axisLine={false} />
              <Tooltip formatter={fmtMoney} />
              <Legend />
              <Line type="monotone" dataKey="income" stroke="#6366f1" name="收入" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="expense" stroke="#f43f5e" name="支出" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer></ChartModal>
        </GlassCard>
      )}
    </div>
  );
}