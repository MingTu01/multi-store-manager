import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface CalendarProps {
  year: number;
  month: number; // 1-12
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateClick?: (date: string) => void;
  renderCell?: (date: string, isToday: boolean, isCurrentMonth: boolean) => React.ReactNode;
  loading?: boolean;
}

function pad(n: number) { return String(n).padStart(2, '0'); }

const WEEK_DAYS = ['一', '二', '三', '四', '五', '六', '日'];

export function Calendar({ year, month, onPrev, onNext, onToday, onDateClick, renderCell, loading }: CalendarProps) {
  const today = new Date();
  const todayStr = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());

  // 计算月历网格
  const firstDay = new Date(year, month - 1, 1);
  // 周一为一周第一天：getDay() 返回 0(周日)-6(周六)，转换为周一为首
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = new Date(year, month - 1, 0).getDate();

  // 5行（35格）优先；装不下时才用6行（42格）
  const totalCells = (firstDayOfWeek + daysInMonth) <= 35 ? 35 : 42;

  const cells: { date: string; isCurrentMonth: boolean; day: number }[] = [];
  // 上月填充
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevMonth = month - 1;
    const prevYear = prevMonth < 1 ? year - 1 : year;
    const m = prevMonth < 1 ? 12 : prevMonth;
    cells.push({ date: `${prevYear}-${pad(m)}-${pad(d)}`, isCurrentMonth: false, day: d });
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${pad(month)}-${pad(d)}`, isCurrentMonth: true, day: d });
  }
  // 下月填充
  const remaining = totalCells - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = month + 1;
    const nextYear = nextMonth > 12 ? year + 1 : year;
    const m = nextMonth > 12 ? 1 : nextMonth;
    cells.push({ date: `${nextYear}-${pad(m)}-${pad(d)}`, isCurrentMonth: false, day: d });
  }

  return (
    <div className="rounded-2xl bg-white/60 backdrop-blur-xl border border-white/40 shadow-sm overflow-hidden">
      {/* 月份切换头部 */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900">{year}年{month}月</h2>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} aria-label="上一月" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <button onClick={onToday} className="rounded-lg px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors">今天</button>
          <button onClick={onNext} aria-label="下一月" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
        </div>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 border-b border-slate-100">
        {WEEK_DAYS.map((d, i) => (
          <div key={d} className={'py-2 text-center text-xs font-medium ' + (i >= 5 ? 'text-rose-400' : 'text-slate-400')}>{d}</div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const isToday = cell.date === todayStr;
          const clickable = onDateClick && cell.isCurrentMonth;
          return (
            <div
              key={idx}
              onClick={() => clickable && onDateClick!(cell.date)}
              className={
                'relative border-b border-r border-slate-100 p-1.5 sm:p-2 ' +
                // 今日整格渐变填充（80% 透明度，柔和不刺眼）
                (isToday && cell.isCurrentMonth
                  ? 'bg-gradient-to-br from-indigo-200/80 via-purple-200/80 to-pink-200/80 '
                  : cell.isCurrentMonth ? 'bg-white/40 ' : 'bg-slate-50/40 ') +
                (clickable ? ' cursor-pointer hover:bg-indigo-50/50 transition-colors' : '') +
                (idx % 7 === 6 ? ' border-r-0' : '') +
                (idx >= totalCells - 7 ? ' border-b-0' : '')
              }
            >
              {/* 日期数字 - 右上角 */}
              <div className="flex justify-end">
                <span className={
                  'text-xs font-medium ' +
                  (!cell.isCurrentMonth ? 'text-slate-300' :
                   isToday ? 'text-indigo-700 font-bold' : 'text-slate-600')
                }>
                  {cell.day}
                </span>
              </div>
              {/* 自定义内容填满剩余空间 */}
              <div className="mt-0.5 min-h-[52px] sm:min-h-[64px]">
                {loading ? (
                  <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                ) : renderCell ? (
                  renderCell(cell.date, isToday, cell.isCurrentMonth)
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
