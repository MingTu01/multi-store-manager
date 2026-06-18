import { ChevronLeft, ChevronRight } from 'lucide-react';

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
const tabs: { key: Period; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
  { key: 'all', label: '总' },
];

export function PeriodTabs({
  period, onPeriodChange, date, onDateChange, hideYearAll,
}: {
  period: Period; onPeriodChange: (p: Period) => void;
  date: Date; onDateChange: (d: Date) => void;
  hideYearAll?: boolean;
}) {
  const visible = hideYearAll ? tabs.filter(t => t.key !== 'year' && t.key !== 'all') : tabs;
  const shift = (dir: number) => {
    const d = new Date(date);
    if (period === 'day') d.setDate(d.getDate() + dir);
    else if (period === 'week') d.setDate(d.getDate() + dir * 7);
    else if (period === 'month') d.setMonth(d.getMonth() + dir);
    else if (period === 'year') d.setFullYear(d.getFullYear() + dir);
    onDateChange(d);
  };
  const handleTabClick = (key: Period) => {
    onPeriodChange(key);
    onDateChange(new Date());
  };
  const fmtDate = () => {
    const d = date;
    if (period === 'day') return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    if (period === 'week') {
      const s = new Date(d); s.setDate(s.getDate() - s.getDay() + 1);
      const e = new Date(s); e.setDate(e.getDate() + 6);
      return s.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' - ' + e.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }
    if (period === 'month') return d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
    if (period === 'year') return d.getFullYear() + '年';
    return '全部';
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
        {visible.map((t) => (
          <button key={t.key} onClick={() => handleTabClick(t.key)}
            className={'flex-1 rounded-lg py-1.5 text-xs font-medium transition-all ' + (period === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
          </button>
        ))}
      </div>
      {period !== 'all' && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={(e) => { e.stopPropagation(); shift(-1); }} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/50">
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="min-w-[120px] text-center text-sm font-medium text-slate-700">{fmtDate()}</span>
          <button onClick={(e) => { e.stopPropagation(); shift(1); }} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-white/50">
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>
      )}
    </div>
  );
}