import { showToast } from '../../components/Toast';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../stores/data';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { ImagePreview } from '../../components/ImagePreview';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { formatMoney } from '../../lib/format';
import { ChevronLeft, ChevronRight, Check, Loader2, X, FileText, Trash2 } from 'lucide-react';
import { useConfirm } from '../../components/useConfirm';

function formatDateTime(d: string | null | undefined): string {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return d;
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0') + ' ' + String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0') + ':' + String(dt.getSeconds()).padStart(2, '0');
  } catch { return d || ''; }
}

function getMonths(count = 12) {
  const m: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    m.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }
  return m;
}

export default function StorePayrollPage() {
const { storeId } = useParams();

  const myRole = useStore((s: any) => s.user?.role);
  const canManage = ['ADMIN', 'STORE_ADMIN', 'MANAGER'].includes(myRole);
  const { confirm, ConfirmDialog } = useConfirm();

  const [month, setMonth] = useState(() => {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
  });
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [editForms, setEditForms] = useState<Record<number, { bonus: string; deduction: string }>>({});
  const [slipPayrollId, setSlipPayrollId] = useState<number | null>(null);
  const [slipEmployeeIdx, setSlipEmployeeIdx] = useState(0);
  const [monthOpen, setMonthOpen] = useState(false);
  const [storeName, setStoreName] = useState('');
  const months = getMonths();
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId).then((d: any) => setStoreName(d.name || '')).catch(() => {});
    api.get('/stores/' + storeId + '/payrolls?month=' + month)
      .then((d) => { setPayrolls(d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [storeId, month]);

  const loadStaff = async () => {
    if (!storeId) return;
    setLoadingStaff(true);
    try {
      const d = await api.get('/stores/' + storeId + '/staff');
      const active = (d.staff || d || [])
        .filter((s: any) => s.status === 'active' && s.role !== 'SHAREHOLDER')
        .map((s: any) => ({ ...s, monthly_salary: s.salary ?? s.monthly_salary ?? 0, position: s.job_title || s.position || '' }));
      setStaffList(active);
      const forms: Record<number, { bonus: string; deduction: string }> = {};
      active.forEach((s: any) => { forms[s.id] = { bonus: '', deduction: '' }; });
      setEditForms(forms);
    } catch {
      setStaffList([]);
    } finally {
      setLoadingStaff(false);
    }
  };

  const openGenerate = () => { setShowGenerate(true); loadStaff(); };

  const removeStaff = (id: number) => {
    setStaffList((prev) => prev.filter((s) => s.id !== id));
    setEditForms((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const updateEditForm = (id: number, field: string, value: string) => {
    setEditForms((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const handleGenerate = async () => {
    if (staffList.length === 0) return;
    setGenerating(true);
    try {
      const payload = staffList.map((s) => ({
        staff_id: s.id,
        base_salary: s.monthly_salary ?? s.salary ?? 0,
        bonus: parseFloat(editForms[s.id]?.bonus) || 0,
        deduction: parseFloat(editForms[s.id]?.deduction) || 0,
      }));
      await api.post('/stores/' + storeId + '/payrolls/generate', { month, staff: payload });
      setShowGenerate(false);
      load();
    } catch (e: any) {
      showToast(e.message || '生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirm = async (id: number) => {
    if (!await confirm({ message: '确认发放该工资？' })) return;
    try {
      await api.put('/stores/' + storeId + '/payrolls/' + id + '/confirm', {});
      load();
    } catch (e: any) { showToast(e.message || '确认失败', 'error'); }
  };

  const handleDelete = async (id: number) => {
    if (!await confirm({ message: '确认删除该工资单？' })) return;
    try {
      await api.del('/stores/' + storeId + '/payrolls/' + id);
      load();
    } catch (e: any) { showToast(e.message || '删除失败', 'error'); }
  };

  // Payslip state
  const currentPayroll = slipPayrollId ? payrolls.find((p: any) => p.id === slipPayrollId) : null;
  const slipItems = currentPayroll?.items || [];
  const currentEmployee = slipItems[slipEmployeeIdx] || null;

  const openSlip = (payrollId: number) => {
    setSlipPayrollId(payrollId);
    setSlipEmployeeIdx(0);
  };

  const goEmployee = useCallback((dir: number) => {
    const next = slipEmployeeIdx + dir;
    if (next >= 0 && next < slipItems.length) setSlipEmployeeIdx(next);
  }, [slipEmployeeIdx, slipItems.length]);

  useEffect(() => {
    if (slipPayrollId === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goEmployee(-1);
      if (e.key === 'ArrowRight') goEmployee(1);
      if (e.key === 'Escape') setSlipPayrollId(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slipPayrollId, goEmployee]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    if (Math.abs(dx) > 60) goEmployee(dx < 0 ? 1 : -1);
    touchRef.current = null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="工资" />
        <button onClick={openGenerate} className="action-btn hidden lg:inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600">
          <FileText className="h-4 w-4" />生成工资
        </button>
      </div>

      <div className="relative">
        <button onClick={() => setMonthOpen(!monthOpen)} className="flex items-center gap-1 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-700 border border-slate-200">
          {month}<ChevronDown className="h-4 w-4" />
        </button>
        {monthOpen && (
          <div className="absolute top-full left-0 z-30 mt-1 max-h-60 w-40 overflow-y-auto rounded-xl bg-white/95 shadow-xl backdrop-blur-xl border border-slate-100">
            {months.map((m) => (
              <button key={m} onClick={() => { setMonth(m); setMonthOpen(false); }}
                className={'block w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 ' + (m === month ? 'bg-indigo-50 text-indigo-600 font-medium' : 'text-slate-700')}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : payrolls.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <div className="text-sm text-slate-400">暂无工资记录</div>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {payrolls.map((p: any) => (
            <GlassCard key={p.id} className="cursor-pointer p-4 hover:bg-white/80 transition-colors" onClick={() => openSlip(p.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">{p.period}</div>
                  <div className="text-xs text-slate-400">{storeName} · {(p.items || []).length}人</div>
                    {(p.items || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(p.items || []).slice(0, 4).map((item: any, idx: number) => (
                          <span key={idx} className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            {item.user_display_name || item.user_name || '-'}{item.job_title ? '(' + item.job_title + ')' : ''}
                          </span>
                        ))}
                        {(p.items || []).length > 4 && <span className="text-[10px] text-slate-400">+{(p.items || []).length - 4}</span>}
                      </div>
                    )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-indigo-600">{formatMoney(p.total_amount || 0)}</div>
                  <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (p.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {p.status === 'confirmed' ? '已发放' : '草稿'}
                  </span>
                  {p.status === 'confirmed' && p.confirmed_at && (
                    <div className="mt-1 text-xs text-slate-400">发放: {formatDateTime(p.confirmed_at)}</div>
                  )}
                </div>
              </div>
              {p.status !== 'confirmed' && canManage && (
                <div className="mt-3 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }} className="action-btn flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-100"><Trash2 className="h-3 w-3" />删除</button>
                  <button onClick={(e) => { e.stopPropagation(); handleConfirm(p.id); }} className="action-btn flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-600 hover:bg-emerald-100"><Check className="h-3 w-3" />发放</button>
                </div>
              )}
            </GlassCard>
          ))}
        </div>
      )}

      {/* Generate Payroll Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="生成工资" wide>
        {loadingStaff ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
        ) : staffList.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">暂无在职员工</div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-slate-500">月份: {month}</div>
            {staffList.map((s: any) => {
              const base = s.monthly_salary || 0;
              const bonus = parseFloat(editForms[s.id]?.bonus) || 0;
              const deduction = parseFloat(editForms[s.id]?.deduction) || 0;
              const total = base + bonus - deduction;
              return (
                <div key={s.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-slate-800">{s.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.position || '-'}</span>
                    </div>
                    <button onClick={() => removeStaff(s.id)} className="action-btn rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mb-2 text-xs text-slate-500">底薪: {formatMoney(base)}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">奖金</label>
                      <input type="number" value={editForms[s.id]?.bonus || ''} onChange={(e) => updateEditForm(s.id, 'bonus', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">扣款</label>
                      <input type="number" value={editForms[s.id]?.deduction || ''} onChange={(e) => updateEditForm(s.id, 'deduction', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-300" placeholder="0" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">应发</label>
                      <div className="rounded-lg bg-indigo-50 px-2 py-1.5 text-sm font-medium text-indigo-600">{formatMoney(total)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={handleGenerate} disabled={generating || staffList.length === 0} className="action-btn btn w-full disabled:opacity-50">
              {generating ? '生成中...' : '确认生成 (' + staffList.length + '人)'}
            </button>
          </div>
        )}
      </Modal>

      {/* Individual Payslip Modal */}
      <Modal open={slipPayrollId !== null && !!currentPayroll} onClose={() => setSlipPayrollId(null)} title={(storeName ? storeName + " - " : "") + "工资单"} wide>
        {currentPayroll && currentEmployee && (
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {/* Individual Pay Stub */}
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-6 shadow-sm">
              {/* Header */}
              <div className="mb-5 text-center border-b border-indigo-100 pb-4">
                <div className="text-lg font-bold text-slate-800">工资单</div>
                <div className="text-sm text-indigo-500 font-medium">{currentPayroll.period}</div>
                <div className={'mt-2 inline-block rounded-full px-3 py-1 text-xs font-medium ' + (currentPayroll.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
                  {currentPayroll.status === 'confirmed' ? '已发放' : '待发放'}
                </div>
              </div>

              {/* Employee Info */}
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-indigo-100 text-indigo-600 text-lg font-bold shrink-0">
                  {currentEmployee.avatar ? <ImagePreview src={currentEmployee.avatar}><img src={currentEmployee.avatar} className="h-full w-full object-cover" alt=""  loading="lazy"  /></ImagePreview> : (currentEmployee.user_display_name || currentEmployee.user_name || '?')[0]}
                </div>
                <div>
                  <div className="text-base font-semibold text-slate-800">{currentEmployee.user_display_name || currentEmployee.user_name || '-'}</div>
                  {(currentEmployee.job_title || currentEmployee.user_job_title || currentEmployee.position) ? <div className="text-sm text-slate-500">{currentEmployee.job_title || currentEmployee.user_job_title || currentEmployee.position}</div> : null}
                </div>
              </div>

              {/* Salary Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-white/80 px-4 py-3 border border-slate-100">
                  <span className="text-sm text-slate-500">基本工资</span>
                  <span className="text-sm font-semibold text-slate-800">{formatMoney(currentEmployee.base_amount || 0)}</span>
                </div>
                {currentEmployee.bonus > 0 && (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 px-4 py-3 border border-emerald-100">
                    <span className="text-sm text-emerald-600">奖金</span>
                    <span className="text-sm font-semibold text-emerald-700">+{formatMoney(currentEmployee.bonus)}</span>
                  </div>
                )}
                {currentEmployee.deduction > 0 && (
                  <div className="flex items-center justify-between rounded-xl bg-rose-50/80 px-4 py-3 border border-rose-100">
                    <span className="text-sm text-rose-500">扣款</span>
                    <span className="text-sm font-semibold text-rose-600">-{formatMoney(currentEmployee.deduction)}</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex items-center justify-between rounded-xl bg-indigo-500 px-4 py-4 mt-2">
                  <span className="text-sm font-medium text-indigo-100">实发工资</span>
                  <span className="text-xl font-bold text-white">{formatMoney(currentEmployee.total_amount || 0)}</span>
                </div>
              </div>

              {/* Footer */}
              {currentPayroll.status === 'confirmed' && currentPayroll.confirmed_at && (
                <div className="mt-4 text-center text-xs text-slate-400">
                  发放时间: {formatDateTime(currentPayroll.confirmed_at)}
                </div>
              )}
            </div>

            {/* Navigation hint */}
            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-slate-400">
              <span className="hidden sm:inline">← → 键盘切换</span>
              <span className="sm:hidden">左右滑动切换</span>
              <span>{slipEmployeeIdx + 1} / {slipItems.length}</span>
            </div>
          </div>
        )}
      </Modal>

      <FloatingActionButton label="生成工资" onClick={openGenerate} />
    <ConfirmDialog />
    </div>
  );
}

function ChevronDown(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="m6 9 6 6 6-6"/></svg>
);
}
