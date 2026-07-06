import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar } from '../../components/Calendar';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';

function formatMoney(n: number) {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(0);
}

export default function CalendarPage() {
  const nav = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get(`/calendar/monthly?year=${year}&month=${month}`).then((d: any) => {
      setData(d);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month]);

  const profitMap: Record<string, number> = {};
  const openCountMap: Record<string, number> = {};
  if (data?.days) {
    for (const d of data.days) {
      profitMap[d.date] = d.profit;
      openCountMap[d.date] = d.openCount || 0;
    }
  }

  const prevMonth = () => {
    if (month === 1) { setYear(year - 1); setMonth(12); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(year + 1); setMonth(1); }
    else setMonth(month + 1);
  };
  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
  };

  return (
    <div className="space-y-4">
      <PageHeader title="经营日历" subtitle="全店铺经营汇总" />

      <Calendar
        year={year}
        month={month}
        onPrev={prevMonth}
        onNext={nextMonth}
        onToday={goToday}
        loading={loading}
        onDateClick={(date) => nav('/calendar/' + date)}
        renderCell={(date, _isToday, isCurrentMonth) => {
          if (!isCurrentMonth) return null;
          const profit = profitMap[date];
          if (profit === undefined || profit === 0) {
            return <div className="text-[10px] text-slate-300">—</div>;
          }
          const color = profit > 0 ? 'text-emerald-600' : profit < 0 ? 'text-rose-500' : 'text-slate-400';
          const openN = openCountMap[date] || 0;
          const totalN = data?.storeCount || 0;
          return (
            <div className="space-y-0.5">
              <div className={'text-xs font-semibold ' + color}>{profit > 0 ? '+' : ''}{formatMoney(profit)}</div>
              <div className="text-[10px] text-slate-400">{openN}/{totalN}店营业</div>
            </div>
          );
        }}
      />

      <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>盈利</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500"></span>亏损</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-slate-300"></span>无数据</span>
        <span className="text-slate-400">点击日期查看详情</span>
      </div>
    </div>
  );
}
