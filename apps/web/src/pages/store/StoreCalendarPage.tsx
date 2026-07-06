import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Calendar } from '../../components/Calendar';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { useStore } from '../../stores/data';

function formatMoney(n: number) {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(0);
}

export default function StoreCalendarPage() {
  const { storeId } = useParams();
  const nav = useNavigate();
  const user = useStore((s) => s.user);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const canViewFinance = user && ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'SHAREHOLDER'].includes(user.role);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get(`/stores/${storeId}/calendar/monthly?year=${year}&month=${month}`).then((d: any) => {
      setData(d);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [year, month, storeId]);

  const dayMap: Record<string, any> = {};
  if (data?.days) {
    for (const d of data.days) {
      dayMap[d.date] = d;
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
      <PageHeader title="经营日历" subtitle={canViewFinance ? '门店经营汇总' : '交接与排休'} />

      <Calendar
        year={year}
        month={month}
        onPrev={prevMonth}
        onNext={nextMonth}
        onToday={goToday}
        loading={loading}
        onDateClick={(date) => nav('/store/' + storeId + '/calendar/' + date)}
        renderCell={(date, _isToday, isCurrentMonth) => {
          if (!isCurrentMonth) return null;
          const d = dayMap[date];
          if (!d) return null;

          if (canViewFinance) {
            // 管理类角色：显示盈利
            const profit = d.profit;
            if (profit === null || profit === undefined) return null;
            if (profit === 0) return <div className="text-[10px] text-slate-300">—</div>;
            const color = profit > 0 ? 'text-emerald-600' : 'text-rose-500';
            return (
              <div className="space-y-0.5">
                <div className={'text-xs font-semibold ' + color}>{profit > 0 ? '+' : ''}{formatMoney(profit)}</div>
                {d.rest_count > 0 && <div className="text-[10px] text-orange-400">{d.rest_count}人休</div>}
              </div>
            );
          } else {
            // STAFF：显示标记
            return (
              <div className="flex flex-wrap gap-0.5">
                {d.has_handover && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" title="有交接" />}
                {d.rest_count > 0 && <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" title={`${d.rest_count}人休息`} />}
                {d.my_rest && <span className="text-[9px] text-orange-500 font-medium">我休</span>}
              </div>
            );
          }
        }}
      />

      <div className="flex items-center justify-center gap-4 text-xs text-slate-500 flex-wrap">
        {canViewFinance ? (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>盈利</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500"></span>亏损</span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400"></span>有交接</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-400"></span>有排休</span>
          </>
        )}
        <span className="text-slate-400">点击日期查看详情</span>
      </div>
    </div>
  );
}
