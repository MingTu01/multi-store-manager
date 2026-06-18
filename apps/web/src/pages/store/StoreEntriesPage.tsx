import { useEffect, useState, useRef } from 'react';
import { useDataVersion } from '../../stores/data-sync';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useStore } from '../../stores/data';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import { Pagination } from '../../components/Pagination';
import { Plus, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
// 获取本地日期
function getLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


export default function StoreEntriesPage() {
  const { storeId } = useParams();
  const dataVersion = useDataVersion('store', storeId);
  const myRole = useStore((s) => s.user?.role);
  const isStaff = myRole === 'STAFF';
  const location = useLocation();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ type: 'income', amount: '', category_id: '', note: '', date: '' });
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState({ income: 0, expense: 0, profit: 0 });
  const modalOpenedRef = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId + '/entries?page=' + page + '&pageSize=' + pageSize + (isStaff ? '&period=day' : '')).then((d) => {
      setEntries(d.entries || d.data || []);
      setTotal(d.total || 0);
    }).catch(() => {});
    api.get('/stores/' + storeId + '/categories').then((d) => setCategories(d || [])).catch(() => {});
    api.get('/stores/' + storeId + '/entries/stats').then((d) => setStats(d)).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId, page, dataVersion]);

  // Auto-open modal when navigated with openModal state (from overview quick action)
  useEffect(() => {
    if (location.state?.openModal && !modalOpenedRef.current) {
      modalOpenedRef.current = true;
      setEditId(null);
      const today = getLocalDate();
      setForm({ type: 'income', amount: '', category_id: '', note: '', date: today });
      setShowModal(true);
    }
  }, [location.state]);

  const openCreate = () => {
    setEditId(null);
    const today = getLocalDate();
    const salesCat = categories.find((c: any) => c.name === '销售' && c.type === 'income');
    setForm({ type: 'income', amount: '', category_id: salesCat ? String(salesCat.id) : '', note: '', date: today });
    setShowModal(true);
  };
  const openEdit = (e: any) => {
    setEditId(e.id);
    setForm({ type: e.type, amount: String(e.amount), category_id: String(e.category_id || ''), note: e.note || '', date: e.date || '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.amount) return;
    setSaving(true);
    try {
      const body = { ...form, amount: parseFloat(form.amount), category_id: parseInt(form.category_id) || null };
      if (editId) {
        await api.put('/stores/' + storeId + '/entries/' + editId, body);
      } else {
        await api.post('/stores/' + storeId + '/entries', body);
      }
      setShowModal(false);
      modalOpenedRef.current = false;
      // Clear navigation state so modal doesn't reopen
      if (location.state?.openModal) {
        navigate('.', { replace: true, state: {} });
      }
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除？')) return;
    try { await api.del('/stores/' + storeId + '/entries/' + id); load(); } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const cats = categories.filter((c: any) => c.type === form.type);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title={"记账"} />
        <button onClick={openCreate} className="action-btn hidden lg:inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600"><Plus className="h-4 w-4" />记一笔</button>
      </div>

      <div className={`grid grid-cols-1 gap-3 ${isStaff ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        <GlassCard className="p-4 text-center">
          <div className="text-xs text-slate-500">今日收入</div>
          <div className="mt-1 text-2xl font-bold text-emerald-600">{stats.income.toLocaleString()}</div>
        </GlassCard>
        <GlassCard className="p-4 text-center">
          <div className="text-xs text-slate-500">今日支出</div>
          <div className="mt-1 text-2xl font-bold text-rose-500">{stats.expense.toLocaleString()}</div>
        </GlassCard>
        {!isStaff && (        <GlassCard className="p-4 text-center">
          <div className="text-xs text-slate-500">今日利润</div>
          <div className={'mt-1 text-2xl font-bold ' + (stats.profit >= 0 ? 'text-emerald-600' : 'text-rose-500')}>{stats.profit.toLocaleString()}</div>
        </GlassCard>)}
      </div>

      <GlassCard className="divide-y divide-slate-100">
        {entries.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">暂无记录</div>
        ) : entries.map((e: any) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              {(e.type === 'income' || e.type === '收入') ? <ArrowUpCircle className="h-5 w-5 text-emerald-500" /> : <ArrowDownCircle className="h-5 w-5 text-rose-500" />}
              <div>
                <div className="text-sm font-medium text-slate-800">{e.category_name || '未分类'}</div>
                <div className="text-xs text-slate-400">{e.note || ''} · {e.created_at || e.date}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={'text-sm font-bold ' + ((e.type === 'income' || e.type === '收入') ? 'text-emerald-600' : 'text-rose-500')}>
                {(e.type === 'income' || e.type === '收入') ? '+' : '-'}{e.amount.toLocaleString()}
              </span>
              {!isStaff && (<button onClick={() => openEdit(e)} className="action-btn flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100"><Edit3 className="h-3.5 w-3.5 text-slate-400" /></button>)}
              {!isStaff && (<button onClick={() => handleDelete(e.id)} className="action-btn flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5 text-rose-400" /></button>)}
            </div>
          </div>
        ))}
      </GlassCard>

      <Pagination
        total={total}
        page={page}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editId ? '编辑记账' : '新增记账'}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">类型</label>
            <div className="flex gap-2">
              <button onClick={() => setForm({ ...form, type: 'income', category_id: '' })} className={'flex-1 rounded-xl py-2 text-sm ' + (form.type === 'income' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600')}>收入</button>
              <button onClick={() => setForm({ ...form, type: 'expense', category_id: '' })} className={'flex-1 rounded-xl py-2 text-sm ' + (form.type === 'expense' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600')}>支出</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">金额</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">分类</label>
            <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">
              <option value="">未分类</option>
              {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">日期</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">备注</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder={"可选"} />
          </div>
          <button onClick={handleSave} disabled={saving} className="action-btn btn w-full disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
      </Modal>

      <FloatingActionButton label={"记一笔"} onClick={openCreate} />
    </div>
  );
}