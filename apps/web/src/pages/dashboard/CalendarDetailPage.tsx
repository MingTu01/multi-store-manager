import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Store as StoreIcon, TrendingUp, TrendingDown, Clock, MessageSquare, UserX } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { GlassCard } from '../../components/GlassCard';
import { api } from '../../lib/api';

function formatMoney(n: number) {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(2);
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: '病假', personal: '事假', annual: '年假'
};

export default function CalendarDetailPage() {
  const { date } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    api.get(`/calendar/daily?date=${date}`).then((d: any) => {
      setData(d);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  }, [date]);

  const totalProfit = data?.stores?.reduce((sum: number, s: any) => sum + (s.profit || 0), 0) || 0;
  const totalIncome = data?.stores?.reduce((sum: number, s: any) => sum + (s.income || 0), 0) || 0;
  const totalExpense = data?.stores?.reduce((sum: number, s: any) => sum + (s.expense || 0), 0) || 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={date || ''}
        subtitle="经营日详情"
        action={
          <button onClick={() => nav('/calendar')} className="flex items-center gap-1 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-600 hover:bg-white/80 backdrop-blur-sm">
            <ArrowLeft className="h-4 w-4" />返回日历
          </button>
        }
      />

      {/* 当日总览 */}
      <GlassCard className="p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-slate-400">总收入</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-base font-semibold text-emerald-600">
              <TrendingUp className="h-4 w-4" />¥{formatMoney(totalIncome)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">总支出</div>
            <div className="mt-1 flex items-center justify-center gap-1 text-base font-semibold text-rose-500">
              <TrendingDown className="h-4 w-4" />¥{formatMoney(totalExpense)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">总盈利</div>
            <div className={'mt-1 text-base font-semibold ' + (totalProfit > 0 ? 'text-emerald-600' : totalProfit < 0 ? 'text-rose-500' : 'text-slate-400')}>
              ¥{formatMoney(totalProfit)}
            </div>
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : !data?.stores || data.stores.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-slate-400">暂无店铺数据</GlassCard>
      ) : (
        <div className="space-y-3">
          {data.stores.map((s: any) => (
            <GlassCard key={s.store_id} className="p-4">
              {/* 店铺头部 */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StoreIcon className="h-4 w-4 text-indigo-500" />
                  <span className="font-medium text-slate-900">{s.name}</span>
                  <span className={'rounded-full px-2 py-0.5 text-[10px] font-medium ' + (s.is_open ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500')}>
                    {s.is_open ? '营业中' : '已闭店'}
                  </span>
                </div>
                <button
                  onClick={() => nav('/store/' + s.store_id)}
                  className="text-xs text-indigo-500 hover:text-indigo-600"
                >
                  进入店铺 →
                </button>
              </div>

              {/* 收支三列 */}
              <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50/60 p-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-400">收入</div>
                  <div className="text-sm font-semibold text-emerald-600">¥{formatMoney(s.income)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">支出</div>
                  <div className="text-sm font-semibold text-rose-500">¥{formatMoney(s.expense)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">盈利</div>
                  <div className={'text-sm font-semibold ' + (s.profit > 0 ? 'text-emerald-600' : s.profit < 0 ? 'text-rose-500' : 'text-slate-400')}>¥{formatMoney(s.profit)}</div>
                </div>
              </div>

              {/* 开闭店记录 */}
              {(s.open_close?.open || s.open_close?.close) && (
                <div className="mb-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {s.open_close?.open && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-emerald-600">
                      <Clock className="h-3 w-3" />开店 {s.open_close.open.user_name} {s.open_close.open.time?.slice(11, 16)}
                    </span>
                  )}
                  {s.open_close?.close && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-slate-500">
                      <Clock className="h-3 w-3" />闭店 {s.open_close.close.user_name} {s.open_close.close.time?.slice(11, 16)}
                    </span>
                  )}
                </div>
              )}

              {/* 交接内容 */}
              {s.handovers?.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600">
                    <MessageSquare className="h-3 w-3" />交接内容
                  </div>
                  <div className="space-y-1">
                    {s.handovers.map((h: any, i: number) => (
                      <div key={i} className="rounded-lg bg-amber-50/60 px-2 py-1 text-xs">
                        <span className="text-slate-500">{h.user_name}</span>
                        <span className="ml-1 text-[10px] text-slate-400">
                          {h.type === 'daily' ? '日常' : h.type === 'shift_open' ? '开店' : '闭店'}
                        </span>
                        <div className="mt-0.5 text-slate-700">{h.content}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 休息员工 */}
              {s.rest_staff?.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <UserX className="h-3 w-3 text-slate-400" />
                  {s.rest_staff.map((r: any, i: number) => (
                    <span key={i} className={'rounded-full px-2 py-0.5 text-[10px] ' + (r.type === 'rest' ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600')}>
                      {r.user_name}{r.type === 'leave' ? `（${LEAVE_TYPE_LABEL[r.leave_type] || '请假'}）` : ' 休'}
                    </span>
                  ))}
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
