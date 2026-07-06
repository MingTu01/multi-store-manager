import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, TrendingUp, DollarSign, Divide,
  MessageSquare, Moon, Plus, Trash2, Clock, Edit2
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { GlassCard } from '../../components/GlassCard';
import { Modal } from '../../components/Modal';
import { showToast } from '../../components/Toast';
import { useConfirm } from '../../components/useConfirm';
import { api, invalidateCache } from '../../lib/api';

function formatMoney(n: number) {
  // 不用万做单位，显示完整数字
  return n.toFixed(2);
}

const LEAVE_TYPE_LABEL: Record<string, string> = { sick: '病假', personal: '事假', annual: '年假' };
const LEAVE_TYPES = [
  { value: 'sick', label: '病假', emoji: '🤒' },
  { value: 'personal', label: '事假', emoji: '📝' },
  { value: 'annual', label: '年假', emoji: '🏖️' },
];

export default function StoreCalendarDetailPage() {
  const { storeId, date } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { confirm, ConfirmDialog } = useConfirm();

  // 添加弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'handover' | 'rest'>('handover');

  // 交接表单
  const [handoverContent, setHandoverContent] = useState('');
  const [savingHandover, setSavingHandover] = useState(false);

  // 排休表单
  const [staff, setStaff] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [restType, setRestType] = useState<'rest' | 'leave'>('rest');
  const [leaveType, setLeaveType] = useState('sick');
  const [restNote, setRestNote] = useState('');
  const [savingRest, setSavingRest] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(false);

  // 编辑交接
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const load = () => {
    if (!storeId || !date) return;
    setLoading(true);
    api.get(`/stores/${storeId}/calendar/daily?date=${date}`).then((d: any) => {
      setData(d);
    }).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [storeId, date]);

  // 打开添加弹窗时加载员工列表
  useEffect(() => {
    if (!showAddModal || !storeId) return;
    if (data?.can_manage_rest) {
      setLoadingStaff(true);
      api.get('/stores/' + storeId + '/staff').then((d: any) => {
        const list = Array.isArray(d) ? d : (d.data || d.staff || []);
        setStaff(list.filter((s: any) => s.status !== 'disabled' && s.status !== 'inactive'));
      }).catch(() => setStaff([])).finally(() => setLoadingStaff(false));
    }
  }, [showAddModal, storeId]);

  const resetAddForm = () => {
    setHandoverContent('');
    setSelectedUserId(null);
    setRestType('rest');
    setLeaveType('sick');
    setRestNote('');
  };

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
      showToast('提交成功', 'success');
      resetAddForm();
      setShowAddModal(false);
      load();
    } catch (e: any) {
      showToast(e.message || '提交失败', 'error');
    } finally {
      setSavingHandover(false);
    }
  };

  const submitRest = async () => {
    if (!selectedUserId) {
      showToast('请选择员工', 'error');
      return;
    }
    setSavingRest(true);
    try {
      await api.post('/stores/' + storeId + '/rest-schedules', {
        user_id: selectedUserId,
        date,
        type: restType,
        leave_type: restType === 'leave' ? leaveType : '',
        note: restNote.trim()
      });
      invalidateCache('rest-schedules');
      invalidateCache('calendar');
      showToast('排休成功', 'success');
      resetAddForm();
      setShowAddModal(false);
      load();
    } catch (e: any) {
      showToast(e.message || '排休失败', 'error');
    } finally {
      setSavingRest(false);
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

  // 格式化日期显示
  const dateDisplay = date ? (() => {
    const d = new Date(date + 'T00:00:00');
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${weekDays[d.getDay()]}`;
  })() : '';

  // 是否显示添加按钮
  const canAdd = data?.can_create_handover || data?.can_manage_rest;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      {/* 顶部日期 */}
      <PageHeader
        title={dateDisplay}
        subtitle={date || ''}
        action={
          <button onClick={() => nav('/store/' + storeId + '/calendar')} className="flex items-center gap-1 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-600 hover:bg-white/80 backdrop-blur-sm">
            <ArrowLeft className="h-4 w-4" />返回日历
          </button>
        }
      />

      {/* ========== 收支盈利 ========== */}
      {data?.can_view_finance && data?.finance && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <TrendingUp className="h-4 w-4 text-indigo-500" />
            门店收支
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50/80 p-3 text-center">
              <div className="text-[11px] font-medium text-emerald-500">收入</div>
              <div className="mt-1 text-lg font-bold text-emerald-600">¥{formatMoney(data.finance.income)}</div>
            </div>
            <div className="rounded-xl bg-rose-50/80 p-3 text-center">
              <div className="text-[11px] font-medium text-rose-500">支出</div>
              <div className="mt-1 text-lg font-bold text-rose-500">¥{formatMoney(data.finance.expense)}</div>
            </div>
            <div className={'rounded-xl p-3 text-center ' + (data.finance.profit >= 0 ? 'bg-emerald-50/80' : 'bg-rose-50/80')}>
              <div className={'text-[11px] font-medium ' + (data.finance.profit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>盈利</div>
              <div className={'mt-1 text-lg font-bold ' + (data.finance.profit > 0 ? 'text-emerald-600' : data.finance.profit < 0 ? 'text-rose-500' : 'text-slate-400')}>
                ¥{formatMoney(data.finance.profit)}
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* ========== 工资 ========== */}
      {data?.can_view_payroll_detail && data?.payroll && data.payroll.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <DollarSign className="h-4 w-4 text-indigo-500" />
            当日确认工资
          </div>
          <div className="space-y-2">
            {data.payroll.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50/60 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-700">{p.period}</div>
                  {p.my_name && <div className="text-xs text-slate-500">我：{p.my_name}</div>}
                </div>
                <div className="text-right">
                  <div className="font-bold text-indigo-600">
                    ¥{formatMoney(p.my_amount !== undefined ? p.my_amount : p.total_amount)}
                  </div>
                  {p.my_amount !== undefined && (
                    <div className="text-[10px] text-slate-400">总额 ¥{formatMoney(p.total_amount)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ========== 分红 ========== */}
      {data?.can_view_dividends && data?.dividends && data.dividends.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Divide className="h-4 w-4 text-indigo-500" />
            当日归档分红
          </div>
          <div className="space-y-2">
            {data.dividends.map((d: any) => (
              <div key={d.id} className="rounded-xl bg-slate-50/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">分红总额</span>
                  <span className="font-bold text-indigo-600">¥{formatMoney(d.total_amount)}</span>
                </div>
                {d.details && d.details.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.details.map((dd: any, i: number) => (
                      <span key={i} className="rounded-lg bg-white px-2.5 py-1 text-xs text-slate-600 shadow-sm">
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

      {/* ========== 交接内容 ========== */}
      {data?.can_view_handovers && (
        <GlassCard className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MessageSquare className="h-4 w-4 text-amber-500" />
            交接内容
          </div>

          <div className="space-y-2">
            {/* 日常交接 */}
            {data.daily_handovers?.map((h: any) => (
              <div key={h.id} className="rounded-xl bg-amber-50/60 px-4 py-3">
                {editingId === h.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEdit} className="flex-1 rounded-xl bg-indigo-500 py-2 text-xs font-medium text-white">保存</button>
                      <button onClick={cancelEdit} className="flex-1 rounded-xl bg-slate-100 py-2 text-xs font-medium text-slate-600">取消</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-700">{h.user_name}</span>
                        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">日常</span>
                        {h.is_mine && <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">我</span>}
                      </div>
                      {h.can_edit && (
                        <div className="flex gap-1">
                          <button onClick={() => startEdit(h)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-indigo-500"><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteHandover(h.id)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 text-sm leading-relaxed text-slate-700">{h.content}</div>
                    <div className="mt-1 text-[10px] text-slate-400">{h.created_at?.slice(11, 16)}</div>
                  </div>
                )}
              </div>
            ))}

            {/* 开闭店交接 */}
            {data.shift_handovers?.map((h: any) => (
              <div key={h.id} className="rounded-xl bg-blue-50/60 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-xs font-semibold text-slate-700">{h.user_name}</span>
                  <span className={'rounded-md px-1.5 py-0.5 text-[10px] font-medium ' + (h.type === 'shift_open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600')}>
                    {h.type === 'shift_open' ? '开店交接' : '闭店交接'}
                  </span>
                </div>
                <div className="mt-1.5 text-sm leading-relaxed text-slate-700">{h.content}</div>
                <div className="mt-1 text-[10px] text-slate-400">{h.created_at?.slice(11, 16)}</div>
              </div>
            ))}

            {(!data.daily_handovers || data.daily_handovers.length === 0) && (!data.shift_handovers || data.shift_handovers.length === 0) && (
              <div className="py-6 text-center text-xs text-slate-400">暂无交接记录</div>
            )}
          </div>
        </GlassCard>
      )}

      {/* ========== 排休 ========== */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Moon className="h-4 w-4 text-orange-500" />
          当日排休
        </div>

        {data?.rest_schedules && data.rest_schedules.length > 0 ? (
          <div className="space-y-2">
            {data.rest_schedules.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-orange-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{r.user_name}</span>
                  <span className={'rounded-md px-2 py-0.5 text-[10px] font-medium ' + (r.type === 'rest' ? 'bg-slate-200 text-slate-600' : 'bg-orange-100 text-orange-700')}>
                    {r.type === 'rest' ? '全天休' : LEAVE_TYPE_LABEL[r.leave_type] || '请假'}
                  </span>
                  {r.note && <span className="text-xs text-slate-400">· {r.note}</span>}
                </div>
                {data.can_manage_rest && (
                  <button onClick={() => deleteRest(r.id, r.user_name)} className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-rose-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">当日无排休</div>
        )}
      </GlassCard>

      {/* ========== 悬浮添加按钮 ========== */}
      {canAdd && (
        <button
          onClick={() => { setAddTab(data?.can_create_handover ? 'handover' : 'rest'); setShowAddModal(true); }}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500 text-white shadow-xl shadow-indigo-500/30 hover:bg-indigo-600 active:scale-95 transition-all lg:right-[calc(50%-14rem)]"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* ========== 添加弹窗 ========== */}
      <Modal
        open={showAddModal}
        onClose={() => { resetAddForm(); setShowAddModal(false); }}
        title={`添加 - ${dateDisplay}`}
      >
        {/* Tab 切换 */}
        <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
          {data?.can_create_handover && (
            <button
              onClick={() => setAddTab('handover')}
              className={'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all ' + (addTab === 'handover' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}
            >
              <MessageSquare className="h-4 w-4" />写交接
            </button>
          )}
          {data?.can_manage_rest && (
            <button
              onClick={() => setAddTab('rest')}
              className={'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all ' + (addTab === 'rest' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}
            >
              <Moon className="h-4 w-4" />排休
            </button>
          )}
        </div>

        {/* 交接 Tab 内容 */}
        {addTab === 'handover' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">交接内容</label>
              <textarea
                value={handoverContent}
                onChange={(e) => setHandoverContent(e.target.value)}
                placeholder="填写需要交接的内容..."
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none resize-none"
                autoFocus
              />
            </div>
            <button
              onClick={submitHandover}
              disabled={savingHandover || !handoverContent.trim()}
              className="w-full rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {savingHandover ? '提交中...' : '提交交接'}
            </button>
          </div>
        )}

        {/* 排休 Tab 内容 */}
        {addTab === 'rest' && (
          <div className="space-y-4">
            {/* 员工选择 - 点击网格 */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">选择员工</label>
              {loadingStaff ? (
                <div className="py-4 text-center text-xs text-slate-400">加载中...</div>
              ) : staff.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">暂无可用员工</div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {staff.map((s: any) => {
                    const isSelected = selectedUserId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedUserId(isSelected ? null : s.id)}
                        className={'flex flex-col items-center gap-1.5 rounded-xl border-2 py-3 transition-all ' + (isSelected ? 'border-indigo-400 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:bg-slate-50')}
                      >
                        <div className={'flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ' + (isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600')}>
                          {s.avatar ? <img src={s.avatar} className="h-full w-full rounded-full object-cover" /> : (s.name?.[0] || s.username?.[0] || '?')}
                        </div>
                        <div className={'text-xs font-medium truncate max-w-full px-1 ' + (isSelected ? 'text-indigo-700' : 'text-slate-600')}>
                          {s.name || s.username}
                        </div>
                        {s.job_title && <div className="text-[10px] text-slate-400 truncate max-w-full px-1">{s.job_title}</div>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 休假类型 */}
            <div>
              <label className="mb-2 block text-xs font-medium text-slate-500">休假类型</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestType('rest')}
                  className={'flex-1 rounded-xl border-2 py-3 text-center text-sm font-medium transition-all ' + (restType === 'rest' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200')}
                >
                  全天休
                </button>
                <button
                  onClick={() => setRestType('leave')}
                  className={'flex-1 rounded-xl border-2 py-3 text-center text-sm font-medium transition-all ' + (restType === 'leave' ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200')}
                >
                  请假
                </button>
              </div>
            </div>

            {/* 请假子类 */}
            {restType === 'leave' && (
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-500">请假类型</label>
                <div className="flex gap-2">
                  {LEAVE_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setLeaveType(t.value)}
                      className={'flex-1 rounded-xl border-2 py-2.5 text-center text-xs font-medium transition-all ' + (leaveType === t.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-100 bg-slate-50/50 text-slate-600 hover:border-slate-200')}
                    >
                      <div className="text-base">{t.emoji}</div>
                      <div className="mt-0.5">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 备注 */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">备注（可选）</label>
              <input
                type="text"
                value={restNote}
                onChange={(e) => setRestNote(e.target.value)}
                placeholder="如：调休、特殊原因等"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-400 focus:outline-none"
              />
            </div>

            <button
              onClick={submitRest}
              disabled={savingRest || !selectedUserId}
              className="w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
            >
              {savingRest ? '提交中...' : '确认排休'}
            </button>
          </div>
        )}
      </Modal>

      <ConfirmDialog />
    </div>
  );
}
