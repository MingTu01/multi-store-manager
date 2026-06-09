import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { MoneyDisplay, formatMoney } from '../../lib/format';
import { Plus, Edit3, Archive, Wallet, Loader2, FileText } from 'lucide-react';

export default function StoreDividendsPage() {
  const { storeId } = useParams();
  const [balance, setBalance] = useState(0);
  const [dividends, setDividends] = useState<any[]>([]);
  const [shareholders, setShareholders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [form, setForm] = useState({ total_amount: '', note: '' });
  const [editForm, setEditForm] = useState({ total_amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [showSlip, setShowSlip] = useState<any>(null);

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/dividends').then((d) => {
      setDividends(d.dividends || []);
      setBalance(d.balance || 0);
      setShareholders(Array.isArray(d) ? d : (d.shareholders || []));
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [storeId]);

  const totalRatio = shareholders.reduce((s: number, sh: any) => s + (sh.ratio || 0), 0);

  const handleCreate = async () => {
    if (!form.total_amount) return;
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/dividends', {
        total_amount: parseFloat(form.total_amount),
        note: form.note,
      });
      setShowCreate(false);
      setForm({ total_amount: '', note: '' });
      load();
    } catch (e: any) { alert(e.message || '创建失败'); }
    finally { setSaving(false); }
  };

  const handleSaveEdit = async () => {
    if (!showEdit) return;
    setSaving(true);
    try {
      await api.put('/stores/' + storeId + '/dividends/' + showEdit.id, {
        total_amount: parseFloat(editForm.total_amount),
        note: editForm.note,
      });
      setShowEdit(null);
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handleArchive = async (id: number) => {
    if (!confirm('归档后将创建支出记录，确认继续？')) return;
    try {
      await api.put('/stores/' + storeId + '/dividends/' + id + '/archive', {});
      load();
    } catch (e: any) { alert(e.message || '归档失败'); }
  };

  const openEdit = (d: any) => {
    setShowEdit(d);
    setEditForm({ total_amount: String(d.total_amount || 0), note: d.note || '' });
  };

  const calcAmount = (total: number, ratio: number) => totalRatio > 0 ? (total * ratio / totalRatio) : 0;
  const amountVal = parseFloat(form.total_amount) || 0;
  const editAmountVal = parseFloat(editForm.total_amount) || 0;

  return (
    <div className="space-y-4">
      <PageHeader title="分红" action={
        <button onClick={() => setShowCreate(true)} className="btn text-sm"><Plus className="mr-1 h-4 w-4" />创建分红</button>
      } />

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50"><Wallet className="h-6 w-6 text-indigo-500" /></div>
          <div>
            <div className="text-xs text-slate-500">可分红余额</div>
            <MoneyDisplay value={balance} className="text-2xl text-indigo-600" />
          </div>
        </div>
      </GlassCard>

      {loading ? (
        <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-indigo-500" /></div>
      ) : dividends.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">
          <FileText className="mx-auto mb-2 h-8 w-8" />暂无分红记录
        </GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {dividends.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setShowSlip(d)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                <Wallet className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{d.note || '分红'}</div>
                <div className="text-xs text-slate-400">{d.created_at}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <MoneyDisplay value={d.total_amount || 0} className="text-sm text-amber-600" />
                  <div className={'text-xs ' + (d.status === 'archived' ? 'text-emerald-500' : 'text-amber-500')}>
                    {d.status === 'archived' ? '已归档' : '草稿'}
                  </div>
                </div>
                {d.status === 'draft' && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(d)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100"><Edit3 className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button onClick={() => handleArchive(d.id)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-amber-50"><Archive className="h-3.5 w-3.5 text-amber-500" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </GlassCard>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="创建分红">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">分红总额</label>
            <input type="number" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} className="input" placeholder="0.00" />
          </div>
          {shareholders.length > 0 && amountVal > 0 && (
            <div className="rounded-xl bg-indigo-50 p-3 space-y-2">
              <div className="text-xs font-medium text-slate-600">自动计算</div>
              {shareholders.map((sh: any) => (
                <div key={sh.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">{sh.name} <span className="text-xs text-slate-400">({(sh.ratio * 100).toFixed(0)}%)</span></span>
                  <span className="text-sm font-medium text-indigo-600">{formatMoney(calcAmount(amountVal, sh.ratio))}</span>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-slate-500">备注</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" placeholder="可选" />
          </div>
          <button onClick={handleCreate} disabled={saving || !form.total_amount} className="btn w-full disabled:opacity-50">{saving ? '创建中..' : '创建'}</button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="编辑分红">
        {showEdit && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">分红总额</label>
              <input type="number" value={editForm.total_amount} onChange={(e) => setEditForm({ ...editForm, total_amount: e.target.value })} className="input" />
            </div>
            {shareholders.length > 0 && editAmountVal > 0 && (
              <div className="rounded-xl bg-indigo-50 p-3 space-y-2">
                <div className="text-xs font-medium text-slate-600">自动计算</div>
                {shareholders.map((sh: any) => (
                  <div key={sh.id} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{sh.name} <span className="text-xs text-slate-400">({(sh.ratio * 100).toFixed(0)}%)</span></span>
                    <span className="text-sm font-medium text-indigo-600">{formatMoney(calcAmount(editAmountVal, sh.ratio))}</span>
                  </div>
                ))}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-slate-500">备注</label>
              <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="input" />
            </div>
            <button onClick={handleSaveEdit} disabled={saving} className="btn w-full disabled:opacity-50">{saving ? '保存中..' : '保存'}</button>
          </div>
        )}
      </Modal>

      {/* Dividend Slip Modal */}
      <Modal open={!!showSlip} onClose={() => setShowSlip(null)} title="分红明细" wide>
        {showSlip && (
          <div>
            <div className="mb-4 text-center">
              <div className="text-xs text-slate-500">分红总额</div>
              <div className="text-3xl font-bold text-amber-600">{formatMoney(showSlip.total_amount || 0)}</div>
              <div className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (showSlip.status === 'archived' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                {showSlip.status === 'archived' ? '已归档' : '草稿'}
              </div>
            </div>

            {showSlip.items && showSlip.items.length > 0 && (
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4 space-y-3">
                <div className="text-xs font-medium text-slate-600">分配明细</div>
                {showSlip.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-600">{item.name?.[0] || '?'}</div>
                      <div>
                        <div className="text-sm font-medium text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-400">{((item.ratio || 0) * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                    <MoneyDisplay value={item.amount || 0} className="text-sm text-amber-600" />
                  </div>
                ))}
              </div>
            )}

            {showSlip.note && (
              <div className="mt-3 text-center text-xs text-slate-400">备注: {showSlip.note}</div>
            )}
            <div className="mt-3 text-center text-xs text-slate-400">{showSlip.created_at}</div>
          </div>
        )}
      </Modal>
    </div>
  );
}
