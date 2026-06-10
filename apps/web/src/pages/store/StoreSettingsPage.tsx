import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Building2, Tags, Plus, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

export default function StoreSettingsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'income' });
  const [savingCat, setSavingCat] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => { setStore(d.store || d); }).catch(() => {});
    api.get('/stores/' + storeId + '/categories').then((d) => setCategories(Array.isArray(d) ? d : (d.categories || []))).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId]);

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const openCreateCat = () => { setEditCat(null); setCatForm({ name: '', type: 'income' }); setShowCatModal(true); };
  const openEditCat = (cat: any) => { setEditCat(cat); setCatForm({ name: cat.name || '', type: cat.type || 'income' }); setShowCatModal(true); };

  const handleSaveCat = async () => {
    if (!catForm.name) return;
    setSavingCat(true);
    try {
      const body = { name: catForm.name, type: catForm.type };
      if (editCat) { await api.put('/stores/' + storeId + '/categories/' + editCat.id, body); }
      else { await api.post('/stores/' + storeId + '/categories', body); }
      setShowCatModal(false);
      load();
    } catch (e: any) { showMsg(false, e.message || '保存失败'); }
    finally { setSavingCat(false); }
  };

  const handleDeleteCat = async (id: number, name: string) => {
    if (!confirm('确认删除分类 ' + name + ' ？')) return;
    try { await api.del('/stores/' + storeId + '/categories/' + id); load(); } catch (e: any) { showMsg(false, e.message || '删除失败'); }
  };

  const incomeCategories = categories.filter((c: any) => c.type === 'income');
  const expenseCategories = categories.filter((c: any) => c.type === 'expense');

  return (
    <div className="space-y-4">
      <PageHeader title="门店设置" subtitle={store?.name || ''} />
      {msg && <div className={'rounded-xl p-3 text-sm ' + (msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{msg.text}</div>}

      <GlassCard className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4 text-indigo-500" />基本信息</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">门店名称</span>
            <span className="text-sm font-medium text-slate-800">{store?.name || '-'}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">地址</span>
            <span className="text-sm font-medium text-slate-800">{store?.address || '-'}</span>
          </div>
          <div className="text-xs text-slate-400 text-center py-1">基本信息请在管理页面修改</div>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Tags className="h-4 w-4 text-indigo-500" />分类管理</h3>
          <button onClick={openCreateCat} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"><Plus className="h-3.5 w-3.5" />添加</button>
        </div>
        {incomeCategories.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600"><ArrowUpCircle className="h-3.5 w-3.5" />收入分类</div>
            <div className="space-y-2">
              {incomeCategories.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEditCat(cat)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-emerald-100"><Edit3 className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button onClick={() => handleDeleteCat(cat.id, cat.name)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5 text-rose-500" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {expenseCategories.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-600"><ArrowDownCircle className="h-3.5 w-3.5" />支出分类</div>
            <div className="space-y-2">
              {expenseCategories.map((cat: any) => (
                <div key={cat.id} className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2.5">
                  <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openEditCat(cat)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-100"><Edit3 className="h-3.5 w-3.5 text-slate-500" /></button>
                    <button onClick={() => handleDeleteCat(cat.id, cat.name)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5 text-rose-500" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {categories.length === 0 && <div className="py-6 text-center text-sm text-slate-400">暂无分类</div>}
      </GlassCard>

      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title={editCat ? '编辑分类' : '添加分类'}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">分类名称</label>
            <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="分类名称" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">类型</label>
            <div className="flex gap-2">
              <button onClick={() => setCatForm({ ...catForm, type: 'income' })} className={'flex-1 rounded-xl py-2 text-sm ' + (catForm.type === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600')}>收入</button>
              <button onClick={() => setCatForm({ ...catForm, type: 'expense' })} className={'flex-1 rounded-xl py-2 text-sm ' + (catForm.type === 'expense' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600')}>支出</button>
            </div>
          </div>
          <button onClick={handleSaveCat} disabled={savingCat} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">{savingCat ? '保存中..' : '保存'}</button>
        </div>
      </Modal>
    </div>
  );
}