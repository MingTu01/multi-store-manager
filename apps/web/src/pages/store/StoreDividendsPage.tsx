import { showToast } from '../../components/Toast';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../stores/data';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { MoneyDisplay, formatMoney } from '../../lib/format';
import { Plus, Edit3, Trash2, Archive, Wallet, Loader2, FileText } from 'lucide-react';

export default function StoreDividendsPage() {
  const { storeId } = useParams();
  const myRole = useStore((s) => s.user?.role);
  const canManage = myRole === 'ADMIN' || myRole === 'STORE_ADMIN';
  const [balance, setBalance] = useState(0);
  const [dividends, setDividends] = useState<any[]>([]);
  const [shareholders, setShareholders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ total_amount: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [showSlip, setShowSlip] = useState<any>(null);
  const [showEdit, setShowEdit] = useState<any>(null);
  const [editForm, setEditForm] = useState({ total_amount: '', note: '' });

  const load = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/dividends').then((d) => {
      setDividends(d.dividends || []);
      setBalance(d.balance || 0);
      setShareholders(d.shareholders || []);
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
    } catch (e: any) { showToast(e.message || '创建失败', 'error'); }
    finally { setSaving(false); }
  };


  const handleDelete = async (id: number) => {
    if (!confirm('确认删除该分红记录？')) return;
    try { await api.del('/stores/' + storeId + '/dividends/' + id); load(); } catch (e: any) { showToast(e.message || '删除失败', 'error'); }
  };

  const openEditDividend = (d: any) => {
    setShowEdit(d);
    setEditForm({ total_amount: String(d.total_amount || 0), note: d.note || '' });
  };
  const handleSaveEdit = async () => {
    if (!showEdit) return;
    setSaving(true);
    try {
      await api.put('/stores/' + storeId + '/dividends/' + showEdit.id, { total_amount: parseFloat(editForm.total_amount), note: editForm.note });
      setShowEdit(null);
      load();
    } catch (e: any) { showToast(e.message || '保存失败', 'error'); }
    finally { setSaving(false); }
  };

  const handleArchive = async (id: number) => {
    if (!confirm('归档后将创建支出记录，确认继续？')) return;
    try {
      await api.put('/stores/' + storeId + '/dividends/' + id + '/archive', {});
      load();
    } catch (e: any) { showToast(e.message || '归档失败', 'error'); }
  };

  const calcAmount = (total: number, ratio: number) => totalRatio > 0 ? (total * ratio / totalRatio) : 0;
  const amountVal = parseFloat(form.total_amount) || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="分红" />
        <button onClick={() => setShowCreate(true)} className="action-btn hidden lg:inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600">
          <Plus className="h-4 w-4" />创建分红
        </button>
      </div>

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
            <Wallet className="h-6 w-6 text-indigo-500" />
          </div>
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
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/40 transition-colors" onClick={() => setShowSlip(d)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                <Wallet className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{d.note || '分红'}</div>
                <div className="text-xs text-slate-400">{d.created_at}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-amber-600">{formatMoney(d.total_amount || 0)}</div>
                <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (d.status === 'archived' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                  {d.status === 'archived' ? '已归档' : '草稿'}
                </span>
              </div>
              {d.status !== 'archived' && canManage && (
                <div className="flex gap-1">
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500" title="删除"><Trash2 className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); openEditDividend(d); }} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-500" title="修改"><Edit3 className="h-3.5 w-3.5" /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleArchive(d.id); }} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-500" title="归档"><Archive className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
          ))}
        </GlassCard>
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="创建分红">
        <div className="space-y-4">
          <div className="rounded-xl bg-indigo-50 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-indigo-700">可分红余额</span>
            <span className="text-lg font-bold text-indigo-600">{formatMoney(balance)}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">分红总额</label>
            <input
              type="number"
              value={form.total_amount}
              onChange={(e) => setForm({ ...form, total_amount: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="0"
            />
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
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="可选"
            />
          </div>
          <button onClick={handleCreate} disabled={saving || !form.total_amount} className="action-btn btn w-full disabled:opacity-50">
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </Modal>

      {/* Dividend Detail Modal */}
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

            {/* Individual amounts breakdown */}
            {(showSlip.items && showSlip.items.length > 0) || shareholders.length > 0 ? (
              <div className="rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
                <div className="mb-3 text-xs font-medium text-slate-600">分配明细</div>
                <div className="border-t border-slate-200 pt-3 space-y-3">
                  {(showSlip.items && showSlip.items.length > 0 ? showSlip.items : shareholders).map((item: any, i: number) => {
                    const ratio = item.ratio || 0;
                    const pct = totalRatio > 0 ? (ratio / totalRatio * 100).toFixed(0) : '0';
                    const amount = item.amount || calcAmount(showSlip.total_amount || 0, ratio);
                    return (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-600">
                            {(item.shareholder_name || item.name || '?')[0]}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-800">{item.shareholder_name || item.name || '-'}</div>
                            <div className="text-xs text-slate-400">{pct}%</div>
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-amber-600">{formatMoney(amount)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showSlip.note && (
              <div className="mt-3 text-center text-xs text-slate-400">备注: {showSlip.note}</div>
            )}
            <div className="mt-3 text-center text-xs text-slate-400">{showSlip.created_at}</div>
          </div>
        )}
      </Modal>


      {/* Edit Modal */}
      <Modal open={!!showEdit} onClose={() => setShowEdit(null)} title="编辑分红">
        {showEdit && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">分红总额</label>
              <input type="number" value={editForm.total_amount} onChange={(e) => setEditForm({ ...editForm, total_amount: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">备注</label>
              <input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
            </div>
            <button onClick={handleSaveEdit} disabled={saving} className="action-btn w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">{saving ? '保存中..' : '保存'}</button>
          </div>
        )}
      </Modal>
      {canManage && <FloatingActionButton label="创建分红" onClick={() => setShowCreate(true)} />}
    </div>
  );
}
