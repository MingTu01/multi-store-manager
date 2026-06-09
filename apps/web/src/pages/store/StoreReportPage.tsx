import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { PeriodTabs, type Period } from '../../components/PeriodTabs';
import { MoneyDisplay } from '../../lib/format';
import { useStore } from '../../stores/data';
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const fmtMoney = (v: any) => String.fromCharCode(165) + Number(v).toLocaleString();

export default function StoreReportPage() {
  const { storeId } = useParams();
  const role = useStore((s) => s.user?.role);
  const [period, setPeriod] = useState<Period>('month');
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState<any>(null);
  const [store, setStore] = useState<any>(null);
  const hideYearAll = role === 'MANAGER' || role === 'STAFF';

  useEffect(() => {
    if (!storeId) return;
    const d = date.toISOString().split('T')[0];
    api.get('/stores/' + storeId + '/report?period=' + period + '&date=' + d).then(setData).catch(() => {});
    api.get('/stores/' + storeId).then((d) => setStore(d)).catch(() => {});
  }, [storeId, period, date]);

  const income = data?.income ?? 0;
  const expense = data?.expense ?? 0;
  const profit = income - expense;
  const margin = income > 0 ? (profit / income * 100) : 0;
  const incomeByCategory = data?.incomeByCategory || [];
  const expenseByCategory = data?.expenseByCategory || [];
  const comparison = data?.comparison || [];

  return (
    <div className="space-y-4">
      <PageHeader title={(store?.name || '') + ' ' + String.fromCharCode(25253,34920)} subtitle={String.fromCharCode(32463,33829,25968,25454)} />
      <PeriodTabs period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} hideYearAll={hideYearAll} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: String.fromCharCode(25910,20837), value: income, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: TrendingUp },
          { label: String.fromCharCode(25903,20986), value: expense, color: 'text-rose-600', bg: 'bg-rose-50', icon: TrendingDown },
          { label: String.fromCharCode(21033,28070), value: profit, color: profit >= 0 ? 'text-indigo-600' : 'text-rose-600', bg: 'bg-indigo-50', icon: DollarSign },
          { label: String.fromCharCode(27611,21033,29575), value: margin, color: 'text-amber-600', bg: 'bg-amber-50', icon: Percent, suffix: '%' },
        ].map((c) => (
          <GlassCard key={c.label} className="p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-slate-500">{c.label}</span>
              <div className={'flex h-7 w-7 items-center justify-center rounded-lg ' + c.bg}><c.icon className={'h-3.5 w-3.5 ' + c.color} /></div>
            </div>
            <MoneyDisplay value={c.value} className={'text-xl ' + c.color} />
            {c.suffix && <span className={'text-xl font-bold ' + c.color}>{c.suffix}</span>}
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{String.fromCharCode(25910,20837,26500,25104)}</h3>
          {incomeByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={incomeByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={({ category, percent }: any) => category + ' ' + (percent * 100).toFixed(0) + '%'}>
                {incomeByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={fmtMoney} /></PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">{String.fromCharCode(26242,26080,25968,25454)}</div>}
        </GlassCard>
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{String.fromCharCode(25903,20986,26500,25104)}</h3>
          {expenseByCategory.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={expenseByCategory} dataKey="amount" nameKey="category" cx="50%" cy="50%" outerRadius={70} label={({ category, percent }: any) => category + ' ' + (percent * 100).toFixed(0) + '%'}>
                {expenseByCategory.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie><Tooltip formatter={fmtMoney} /></PieChart>
            </ResponsiveContainer>
          ) : <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">{String.fromCharCode(26242,26080,25968,25454)}</div>}
        </GlassCard>
      </div>

      {comparison.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">{String.fromCharCode(36235,21183,23545,27604)}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={comparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={fmtMoney} />
              <Bar dataKey="income" fill="#6366f1" name={String.fromCharCode(25910,20837)} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#f43f5e" name={String.fromCharCode(25903,20986)} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      )}
    </div>
  );
}
