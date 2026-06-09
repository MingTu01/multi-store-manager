import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { MoneyDisplay, formatMoney } from '../../lib/format';
import { ChevronLeft, ChevronRight, Check, Edit3, FileText, Loader2, ChevronDown } from 'lucide-react';

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
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0');
  });
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [editForm, setEditForm] = useState({ bonus: '', deduction: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [showSlip, setShowSlip] = useState<number | null>(null);
  const [monthOpen, setMonthOpen] = useState(false);
  const months = getMonths();
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/payrolls?month=' + month).then((d) => { setPayrolls(d.payrolls || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [storeId, month]);

  const handleGenerate = async () => {
    if (!confirm('确认为 ' + month + ' 生成工资？')) return;
    setGenerating(true);
    try {
      await api.post('/stores/' + storeId + '/payrolls/generate', { month });
      load();
    } catch (e: any) { alert(e.message || '生成失败'); }
    finally { setGenerating(false); }
  };

  const handleConfirm = async (id: number) => {
    if (!confirm('确认发放该工资？')) return;
    try {
      await api.put('/stores/' + storeId + '/payrolls/' + id + '/confirm', {});
      load();
    } catch (e: any) { alert(e.message || '确认失败'); }
  };

  const openEdit = (p: any) => {
    setShowEdit(p);
    setEditForm({ bonus: String(p.bonus || 0), deduction: String(p.deduction || 0), note: p.note || '' });
  };

  const handleSaveEdit = async () => {
    if (!showEdit) return;
    setSaving(true);
    try {
      await api.put('/stores/' + storeId + '/payrolls/' + showEdit.id, {
        bonus: parseFloat(editForm.bonus) || 0,
        deduction: parseFloat(editForm.deduction) || 0,
        note: editForm.note,
      });
      setShowEdit(null);
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const slipItems = payrolls;
  const currentSlipIdx = slipItems.findIndex((p: any) => p.id === showSlip);
  const currentSlip = currentSlipIdx >= 0 ? slipItems[currentSlipIdx] : null;

  const goSlip = useCallback((dir: number) => {
    const next = currentSlipIdx + dir;
    if (next >= 0 && next < slipItems.length) setShowSlip(slipItems[next].id);
  }, [currentSlipIdx, slipItems]);

  useEffect(() => {
    if (showSlip === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goSlip(-1);
      if (e.key === 'ArrowRight') goSlip(1);
      if (e.key === 'Escape') setShowSlip(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showSlip, goSlip]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const dx = e.changedTouches[0].clientX - touchRef.current.x;
    if (Math.abs(dx) > 60) goSlip(dx < 0 ? 1 : -1);
    touchRef.current = null;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="工资" action={
        <button onClick={handleGenerate} disabled={generating} className="btn text-sm">
          {generating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{generating ? '生成中..' : '生成工资'}
        </button>
      } />

      <div className="relative">
        <button onClick={() => setMonthOpen(!monthOpen)} className="flex items-center gap-2 rounded-xl bg-white/60 px-4 py-2.5 text-sm font-medium text-slate-700 backdrop-blur-sm">
          {month} <ChevronDown className={'h-4 w-4 text-slate-400 transition-transform ' + (monthOpen ? 'rotate-180' : '')} />
        </button>
        {monthOpen && (
          <div className="absolute z-20 mt-1 max-h-60 w-48 overflow-y-auto rounded-xl border border-white/40 bg-white/90 shadow-xl backdrop-blur-xl">
            {months.map((m) => (
              <button key={m} onClick={() => { setMonth(m); setMonthOpen(false); }}
                className={'flex w-full items-center px-4 py-2.5 text-sm hover:bg-indigo-50 ' + (m === month ? 'bg-indigo-50 font-semibold text-indigo-600' : 'text-slate-600')}>
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : payrolls.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <FileText className="mx-auto mb-2 h-8 w-8" />暂无工资记录，点击右上角生成
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {payrolls.map((p: any) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setShowSlip(p.id)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">{p.staff_name?.[0] || '?'}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{p.staff_name}</div>
                <div className="text-xs text-slate-400">{p.position || ''} · 底薪 {formatMoney(p.base_salary || 0)}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <MoneyDisplay value={p.total || 0} className="text-sm text-indigo-600" />
                  <div className={'text-xs ' + (p.status === 'confirmed' ? 'text-emerald-500' : 'text-amber-500')}>
                    {p.status === 'confirmed' ? '已发放' : '草稿'}
                  </div>
                </div>
                {p.status === 'draft' && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(p)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100"><Edit3 className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button onClick={() => handleConfirm(p.id)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-emerald-50"><Check className="h-3.5 w-3.5 text-emerald-500" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </GlassCard>
      )}

      {/* Edit Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="编辑工资">
        {showEdit && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">{showEdit.staff_name?.[0]}</div>
              <div>
                <div className="text-sm font-semibold text-slate-800">{showEdit.staff_name}</div>
                <div className="text-xs text-slate-400">底薪: {formatMoney(showEdit.base_salary || 0)}</div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">奖金</label>
              <input type="number" value={editForm.bonus} onChange={(e) => setEditForm({ ...editForm, bonus: e.target.value })} className="input" placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">扣款</label>
              <input type="number" value={editForm.deduction} onChange={(e) => setEditForm({ ...editForm, deduction: e.target.value })} className="input" placeholder="0" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">备注</label>
              <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="input" placeholder="可选" />
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 text-center">
              <div className="text-xs text-slate-500">应发合计</div>
              <div className="text-lg font-bold text-indigo-600">
                {formatMoney((showEdit.base_salary || 0) + (parseFloat(editForm.bonus) || 0) - (parseFloat(editForm.deduction) || 0))}
              </div>
            </div>
            <button onClick={handleSaveEdit} disabled={saving} className="btn w-full disabled:opacity-50">{saving ? '保存中..' : '保存'}</button>
          </div>
        )}
      </Modal>

      {/* Payslip Modal */}
      <Modal open={showSlip !== null && !!currentSlip} onClose={() => setShowSlip(null)} title="工资明细" wide>
        {currentSlip && (
          <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="mb-4 flex items-center justify-between">
              <button onClick={() => goSlip(-1)} disabled={currentSlipIdx <= 0} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="text-center">
                <div className="text-sm font-semibold text-slate-800">{currentSlip.staff_name}</div>
                <div className="text-xs text-slate-400">{currentSlip.position || ''} · {month}</div>
              </div>
              <button onClick={() => goSlip(1)} disabled={currentSlipIdx >= slipItems.length - 1} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
              <div className="mb-4 text-center">
                <div className="text-xs text-slate-500">应发工资</div>
                <div className="text-3xl font-bold text-indigo-600">{formatMoney(currentSlip.total || 0)}</div>
                <div className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (currentSlip.status === 'confirmed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                  {currentSlip.status === 'confirmed' ? '已发放' : '草稿'}
                </div>
              </div>
              <div className="space-y-3 divide-y divide-slate-100">
                {[
                  { label: '底薪', value: currentSlip.base_salary || 0, color: 'text-slate-800' },
                  { label: '奖金', value: currentSlip.bonus || 0, color: 'text-emerald-600' },
                  { label: '扣款', value: currentSlip.deduction || 0, color: 'text-rose-500', prefix: '-' },
                  { label: '其他', value: currentSlip.other || 0, color: 'text-slate-600' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between pt-3">
                    <span className="text-sm text-slate-500">{item.label}</span>
                    <span className={'text-sm font-medium ' + item.color}>{item.prefix || ''}{formatMoney(item.value)}</span>
                  </div>
                ))}
                {currentSlip.note && (
                  <div className="pt-3">
                    <span className="text-xs text-slate-400">备注: {currentSlip.note}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 text-center text-xs text-slate-400">{currentSlipIdx + 1} / {slipItems.length} · 左右滑动或键盘切换</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
