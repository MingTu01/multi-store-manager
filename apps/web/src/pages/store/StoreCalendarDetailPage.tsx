import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Divide, MessageSquare, UserX, Plus, Trash2, Clock, Edit2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { GlassCard } from '../../components/GlassCard';
import { RestScheduleModal } from '../../components/RestScheduleModal';
import { showToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { api, invalidateCache } from '../../lib/api';
import { useStore } from '../../stores/data';

function formatMoney(n: number) {
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
  return n.toFixed(2);
}

const LEAVE_TYPE_LABEL: Record<string, string> = { sick: '病假', personal: '事假', annual: '年假' };

export default function StoreCalendarDetailPage() {
  const { storeId, date } = useParams();
  const nav = useNavigate();
  const user = useStore((s) => s.user);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRestModal, setShowRestModal] = useState(false);
  const [handoverContent, setHandoverContent] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingHandover, setSavingHandover] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const load = () => {
    if (!storeId || !date) return;
    setLoading(true);
    api.get(`/stores/${storeId}/calendar/daily?date=${date}`).then((d: any) => {
      setData(d);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [storeId, date]);

  const submitHandover = async () => {
    if (!handoverContent.trim()) {
      showToast('请填写交接内容', 'error');
      return;
    }
    setSavingHandover(true);
    try {
      await api.post(`/stores/${storeId}/handovers/daily`, { content: handoverContent, date });
      invalidateCache('handovers');
      invalidateCache('calendar');
      setHandoverContent('');
      showToast('提交成功', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || '提交失败', 'error');
    } finally {
      setSavingHandover(false);
    }
  };

  const startEdit = (h: any) => {
    setEditingId(h.id);
    setEditingContent(h.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingContent('');
  };

  const saveEdit = async () => {
    if (!editingContent.trim()) {
      showToast('请填写交接内容', 'error');
      return;
    }
    try {
      await api.put(`/stores/${storeId}/handovers/daily/${editingId}`, { content: editingContent });
      invalidateCache('handovers');
      invalidateCache('calendar');
      showToast('修改成功', 'success');
      cancelEdit();
      load();
    } catch (e: any) {
      showToast(e.message || '修改失败', 'error');
    }
  };

  const deleteHandover = async (id: number) => {
    if (!await confirm({ message: '确认删除这条交接记录？' })) return;
    try {
      await api.del(`/stores/${storeId}/handovers/daily/${id}`);
      invalidateCache('handovers');
      invalidateCache('calendar');
      showToast('删除成功', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || '删除失败', 'error');
    }
  };

  const deleteRest = async (id: number, name: string) => {
    if (!await confirm({ message: `确认删除 ${name} 的排休记录？` })) return;
    try {
      await api.del(`/stores/${storeId}/rest-schedules/${id}`);
      invalidateCache('rest-schedules');
      invalidateCache('calendar');
      showToast('删除成功', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || '删除失败', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={date || ''}
        subtitle="日详情"
        action={
          <button onClick={() => nav('/store/' + storeId + '/calendar')} className="flex items-center gap-1 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-600 hover:bg-white/80 backdrop-blur-sm">
            <ArrowLeft className="h-4 w-4" />返回
          </button>
        }
      />

      {/* 收支盈利卡片 */}
      {data?.can_view_finance && data?.finance && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <TrendingUp className="h-4 w-4 text-indigo-500" />门店收支
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50/60 p-3 text-center">
            <div>
              <div className="text-[10px] text-slate-400">收入</div>
              <div className="text-base font-semibold text-emerald-600">¥{formatMoney(data.finance.income)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">支出</div>
              <div className="text-base font-semibold text-rose-500">¥{formatMoney(data.finance.expense)}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">盈利</div>
              <div className={'text-base font-semibold ' + (data.finance.profit > 0 ? 'text-emerald-600' : data.finance.profit < 0 ? 'text-rose-500' : 'text-slate-400')}>¥{formatMoney(data.finance.profit)}</div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* 工资卡片 */}
      {data?.can_view_payroll_detail && data?.payroll && data.payroll.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <DollarSign className="h-4 w-4 text-indigo-500" />当日确认工资
          </div>
          <div className="space-y-1">
            {data.payroll.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50/60 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-700">{p.period}</div>
                  {p.my_name && <div className="text-xs text-slate-500">我：{p.my_name}</div>}
                </div>
                <div className="text-right">
                  {p.my_amount !== undefined ? (
                    <div className="font-semibold text-indigo-600">¥{formatMoney(p.my_amount)}</div>
                  ) : (
                    <div className="font-semibold text-indigo-600">¥{formatMoney(p.total_amount)}</div>
                  )}
                  <div className="text-[10px] text-slate-400">总额 ¥{formatMoney(p.total_amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 分红卡片 */}
      {data?.can_view_dividends && data?.dividends && data.dividends.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <Divide className="h-4 w-4 text-indigo-500" />当日归档分红
          </div>
          <div className="space-y-1">
            {data.dividends.map((d: any) => (
              <div key={d.id} className="rounded-lg bg-slate-50/60 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">分红总额</span>
                  <span className="font-semibold text-indigo-600">¥{formatMoney(d.total_amount)}</span>
                </div>
                {d.details && d.details.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {d.details.map((dd: any, i: number) => (
                      <span key={i} className="rounded bg-white px-2 py-0.5 text-[10px] text-slate-500">
                        {dd.shareholder_name} {(dd.ratio * 100).toFixed(1)}% ¥{formatMoney(dd.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* 交接区（STAFF+ 可见）*/}
      {data?.can_view_handovers && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <MessageSquare className="h-4 w-4 text-amber-500" />交接内容
          </div>

          {/* 填写新交接 */}
          {data.can_create_handover && (
            <div className="mb-3 space-y-2">
              <textarea
                value={handoverContent}
                onChange={(e) => setHandoverContent(e.target.value)}
                placeholder="填写需要交接的内容..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
              />
              <button
                onClick={submitHandover}
                disabled={savingHandover || !handoverContent.trim()}
                className="w-full rounded-xl bg-amber-500 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {savingHandover ? '提交中...' : '提交交接'}
              </button>
            </div>
          )}

          {/* 交接列表 */}
          <div className="space-y-2">
            {/* 日常交接 */}
            {data.daily_handovers?.map((h: any) => (
              <div key={h.id} className="rounded-lg bg-amber-50/60 px-3 py-2">
                {editingId === h.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex-1 rounded bg-indigo-500 py-1 text-xs text-white">保存</button>
                      <button onClick={cancelEdit} className="flex-1 rounded bg-slate-200 py-1 text-xs text-slate-600">取消</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-slate-700">{h.user_name}</span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-600">日常</span>
                        {h.is_mine && <span className="text-[10px] text-indigo-400">我</span>}
                      </div>
                      {h.can_edit && (
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(h)} className="text-slate-400 hover:text-indigo-500"><Edit2 className="h-3 w-3" /></button>
                          <button onClick={() => deleteHandover(h.id)} className="text-slate-400 hover:text-rose-500"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{h.content}</div>
                    <div className="mt-0.5 text-[10px] text-slate-400">{h.created_at?.slice(11, 16)}</div>
                  </div>
                )}
              </div>
            ))}

            {/* 开闭店交接 */}
            {data.shift_handovers?.map((h: any) => (
              <div key={h.id} className="rounded-lg bg-blue-50/60 px-3 py-2">
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-blue-400" />
                  <span className="text-xs font-medium text-slate-700">{h.user_name}</span>
                  <span className={'rounded px-1.5 py-0.5 text-[10px] ' + (h.type === 'shift_open' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600')}>
                    {h.type === 'shift_open' ? '开店交接' : '闭店交接'}
                  </span>
                </div>
                <div className="mt-1 text-sm text-slate-700">{h.content}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{h.created_at?.slice(11, 16)}</div>
              </div>
            ))}

            {(!data.daily_handovers || data.daily_handovers.length === 0) && (!data.shift_handovers || data.shift_handovers.length === 0) && (
              <div className="py-3 text-center text-xs text-slate-400">暂无交接记录</div>
            )}
          </div>
        </GlassCard>
      )}

      {/* 排休区（全部角色可见）*/}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <UserX className="h-4 w-4 text-orange-500" />当日排休
          </div>
          {data?.can_manage_rest && (
            <button
              onClick={() => setShowRestModal(true)}
              className="flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 transition-colors"
            >
              <Plus className="h-3 w-3" />添加排休
            </button>
          )}
        </div>

        {data?.rest_schedules && data.rest_schedules.length > 0 ? (
          <div className="space-y-1">
            {data.rest_schedules.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-orange-50/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{r.user_name}</span>
                  <span className={'rounded-full px-2 py-0.5 text-[10px] ' + (r.type === 'rest' ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-600')}>
                    {r.type === 'rest' ? '全天休' : LEAVE_TYPE_LABEL[r.leave_type] || '请假'}
                  </span>
                  {r.note && <span className="text-xs text-slate-400">{r.note}</span>}
                </div>
                {data.can_manage_rest && (
                  <button onClick={() => deleteRest(r.id, r.user_name)} className="text-slate-400 hover:text-rose-500">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-3 text-center text-xs text-slate-400">当日无排休</div>
        )}
      </GlassCard>

      {/* 排休弹窗 */}
      <ConfirmDialog />
      <RestScheduleModal
        open={showRestModal}
        storeId={storeId || ''}
        date={date || ''}
        onClose={() => setShowRestModal(false)}
        onSuccess={() => { setShowRestModal(false); load(); }}
      />
    </div>
  );
}
