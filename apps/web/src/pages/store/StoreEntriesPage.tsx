import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { PeriodTabs, type Period } from '../../components/PeriodTabs';
import { MoneyDisplay } from '../../lib/format';
import { useStore } from '../../stores/data';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';

const incomeCategories = ['营业收入', '其他收入', '退款', '押金'];
const expenseCategories = ['采购成本', '房租', '水电', '人工', '设备', '营销', '其他支出'];

export default function StoreEntriesPage() {
  const { storeId } = useParams();
  const role = useStore((s) => s.user?.role);
  const [period, setPeriod] = useState<Period>('day');
  const [date, setDate] = useState(new Date());
  const [entries, setEntries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ type: '支出', category: '', amount: '', note: '', date: new Date().toISOString().split('T')[0] });
  const [saving, setSaving] = useState(false);
  const hideYearAll = role === 'MANAGER' || role === 'STAFF';

  const load = () => {
    if (!storeId) return;
    const d = date.toISOString().split('T')[0];
    api.get('/stores/' + storeId + '/entries?period=' + period + '&date=' + d).then((r) => {
      setEntries(r.entries || []);
      setSummary(r.summary || {});
    }).catch(() => {});
  };

  useEffect(() => { load(); }, [storeId, period, date]);

  const handleSave = async () => {
    if (!form.category || !form.amount) return;
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/entries', {
        type: form.type,
        category: form.category,
        amount: parseFloat(form.amount),
        note: form.note,
        date: form.date,
      });
      setShowModal(false);
      setForm({ type: '支出', category: '', amount: '', note: '', date: new Date().toISOString().split('T')[0] });
      load();
    } catch (e: any) {
      alert(e.message || '保存失败');
    } finally { setSaving(false); }
  };

  const categories = form.type === 'income' ? incomeCategories : expenseCategories;

  return (
    <div className="space-y-4">
      <PageHeader title="记账" action={
        <button onClick={() => setShowModal(true)} className="btn text-sm"><Plus className="mr-1 h-4 w-4" />记一笔</button>
      } />
      <PeriodTabs period={period} onPeriodChange={setPeriod} date={date} onDateChange={setDate} hideYearAll={hideYearAll} />

      <div className="grid grid-cols-2 gap-3">
        <GlassCard className="p-3 text-center">
          <div className="text-xs text-slate-500">收入</div>
          <MoneyDisplay value={summary.income || 0} className="text-lg text-emerald-600" />
        </GlassCard>
        <GlassCard className="p-3 text-center">
          <div className="text-xs text-slate-500">支出</div>
          <MoneyDisplay value={summary.expense || 0} className="text-lg text-rose-500" />
        </GlassCard>
      </div>

      {entries.length === 0 ? (
        <GlassCard className="py-12 text-center text-sm text-slate-400">暂无记账记录</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {entries.map((e: any) => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className={'flex h-9 w-9 items-center justify-center rounded-full ' + (e.type === '收入' ? 'bg-emerald-50' : 'bg-rose-50')}>
                {e.type === '收入' ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-rose-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-800">{e.category}</div>
                <div className="text-xs text-slate-400">{e.note || ''} · {e.user_name || ''}</div>
              </div>
              <div className="text-right">
                <MoneyDisplay value={e.amount} className={'text-sm ' + (e.type === '收入' ? 'text-emerald-600' : 'text-rose-500')} />
                <div className="text-xs text-slate-400">{e.created_at?.split(' ')[1] || e.created_at}</div>
              </div>
            </div>
          ))}
        </GlassCard>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="新增记账">
        <div className="space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button onClick={() => setForm({ ...form, type: '支出', category: '' })} className={'flex-1 rounded-lg py-2 text-xs font-medium ' + (form.type === 'expense' ? 'bg-rose-500 text-white' : 'text-slate-500')}>支出</button>
            <button onClick={() => setForm({ ...form, type: 'income', category: '' })} className={'flex-1 rounded-lg py-2 text-xs font-medium ' + (form.type === 'income' ? 'bg-emerald-500 text-white' : 'text-slate-500')}>收入</button>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">分类</label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button key={c} onClick={() => setForm({ ...form, category: c })}
                  className={'rounded-lg px-3 py-1.5 text-xs transition-all ' + (form.category === c ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">金额</label>
            <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">备注</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" placeholder="选填" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">日期</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <button onClick={handleSave} disabled={saving} className="btn w-full disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
        </div>
      </Modal>
    </div>
  );
}
