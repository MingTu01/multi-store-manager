import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Plus, Edit2, Trash2, Store, ArrowRight, Camera, Upload, X } from 'lucide-react';

interface Shareholder { name: string; phone: string; ratio: number; }
interface StoreItem { id: string; name: string; address: string; initial_capital: number; is_open: number; status: string; photo?: string; shareholders?: Shareholder[]; staff_count?: number; }

export default function StoresPage() {
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [form, setForm] = useState({ name: '', address: '', initial_capital: '', photo: '', shareholders: [] as Shareholder[] });
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletePwd, setDeletePwd] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nav = useNavigate();

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const load = () => {
    api.get('/stores').then((d: any) => {
      const list = d.stores || (Array.isArray(d) ? d : []);
      setStores(list);
    }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const resetForm = () => setForm({ name: '', address: '', initial_capital: '', photo: '', shareholders: [] });

  const openCreate = () => { setEditing(null); resetForm(); setShowModal(true); };

  const openEdit = (s: StoreItem) => {
    setEditing(s);
    setForm({
      name: s.name || '',
      address: s.address || '',
      initial_capital: String(s.initial_capital || ''),
      photo: s.photo || '',
      shareholders: (s.shareholders || []).map(sh => ({ name: sh.name, phone: sh.phone || '', ratio: sh.ratio })),
    });
    setShowModal(true);
  };

  const addShareholder = () => setForm(f => ({ ...f, shareholders: [...f.shareholders, { name: '', phone: '', ratio: 0 }] }));
  const removeShareholder = (i: number) => setForm(f => ({ ...f, shareholders: f.shareholders.filter((_, idx) => idx !== i) }));
  const updateShareholder = (i: number, field: keyof Shareholder, value: any) => {
    setForm(f => {
      const sh = [...f.shareholders];
      sh[i] = { ...sh[i], [field]: field === 'ratio' ? Number(value) || 0 : value };
      return { ...f, shareholders: sh };
    });
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, photo: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { showMsg(false, '请输入门店名称'); return; }
    setLoading(true);
    try {
      const body: any = { name: form.name, address: form.address, initial_capital: Number(form.initial_capital) || 0, photo: form.photo, shareholders: form.shareholders };
      if (editing) {
        await api.put('/stores/' + editing.id, body);
        showMsg(true, '门店更新成功');
      } else {
        await api.post('/stores', body);
        showMsg(true, '门店创建成功');
      }
      setShowModal(false);
      load();
    } catch (e: any) { showMsg(false, e.message || '保存失败'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteId || !deletePwd) return;
    try {
      await api.del('/stores/' + deleteId, { password: deletePwd });
      showMsg(true, '门店已删除');
      setDeleteId(null);
      setDeletePwd('');
      load();
    } catch (e: any) { showMsg(false, e.message || '删除失败'); }
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400';

  return (
    <div className="space-y-4">
      <PageHeader title="门店管理" subtitle={'共 ' + stores.length + ' 家门店'} action={<button onClick={openCreate} className="btn text-sm"><Plus className="mr-1 h-4 w-4" />新建门店</button>} />

      {msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((s) => {
          const staffCount = (s as any).staff_count ?? 0;
          const shCount = s.shareholders?.length ?? 0;
          return (
            <GlassCard key={s.id} className="cursor-pointer overflow-hidden transition-all hover:shadow-xl" onClick={() => nav('/store/' + s.id)}>
              {s.photo ? (
                <div className="h-32 w-full overflow-hidden bg-slate-100"><img src={s.photo} alt={s.name} className="h-full w-full object-cover" /></div>
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-indigo-50 to-violet-50">
                  <Store className="h-10 w-10 text-indigo-300" />
                </div>
              )}
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <div className="text-base font-semibold text-slate-900">{s.name}</div>
                    {s.address && <div className="mt-0.5 text-xs text-slate-400">{s.address}</div>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${s.is_open === 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {s.is_open === 1 ? '营业中' : '已关闭'}
                  </span>
                </div>
                <div className="mb-3 flex gap-4 text-xs text-slate-500">
                  <span>员工 {staffCount}</span>
                  <span>股东 {shCount}</span>
                  <span>初始资金 {(s.initial_capital || 0).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2 border-t border-slate-100 pt-3" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(s)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"><Edit2 className="h-3.5 w-3.5" />编辑</button>
                  <button onClick={() => { setDeleteId(s.id); setDeletePwd(''); }} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除</button>
                  <div className="flex-1" />
                  <button onClick={() => nav('/store/' + s.id)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50">进入 <ArrowRight className="h-3 w-3" /></button>
                </div>
              </div>
            </GlassCard>
          );
        })}
        {stores.length === 0 && (
          <GlassCard className="col-span-full py-16 text-center text-sm text-slate-400"><Store className="mx-auto mb-3 h-10 w-10" />暂无门店，点击上方按钮创建</GlassCard>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? '编辑门店' : '新建门店'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">门店照片</label>
            <div className="flex items-center gap-3">
              {form.photo ? (
                <div className="relative h-20 w-20 overflow-hidden rounded-xl"><img src={form.photo} className="h-full w-full object-cover" /><button onClick={() => setForm(f => ({ ...f, photo: '' }))} className="absolute right-0.5 top-0.5 rounded-full bg-black/50 p-0.5"><X className="h-3 w-3 text-white" /></button></div>
              ) : (
                <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 hover:border-indigo-300"><Camera className="h-5 w-5 text-slate-400" /><span className="mt-1 text-[10px] text-slate-400">上传</span><input type="file" accept="image/*" onChange={handlePhoto} className="hidden" /></label>
              )}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">门店名称 *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="请输入门店名称" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">地址</label>
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} placeholder="请输入地址" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">初始资金</label>
            <input type="number" value={form.initial_capital} onChange={e => setForm(f => ({ ...f, initial_capital: e.target.value }))} className={inputCls} placeholder="0" />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">股东信息</label>
              <button onClick={addShareholder} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50"><Plus className="h-3 w-3" />添加</button>
            </div>
            {form.shareholders.length === 0 && <div className="py-3 text-center text-xs text-slate-400">暂无股东</div>}
            {form.shareholders.map((sh, i) => (
              <div key={i} className="mb-2 flex items-start gap-2 rounded-xl bg-slate-50 p-2">
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input value={sh.name} onChange={e => updateShareholder(i, 'name', e.target.value)} className={inputCls + ' text-xs'} placeholder="姓名" />
                  <input value={sh.phone} onChange={e => updateShareholder(i, 'phone', e.target.value)} className={inputCls + ' text-xs'} placeholder="电话" />
                  <div className="flex items-center gap-1"><input type="number" value={sh.ratio || ''} onChange={e => updateShareholder(i, 'ratio', e.target.value)} className={inputCls + ' text-xs'} placeholder="占比" /><span className="text-xs text-slate-400">%</span></div>
                </div>
                <button onClick={() => removeShareholder(i)} className="mt-1 rounded-lg p-1 text-rose-400 hover:bg-rose-50"><X className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button onClick={handleSave} disabled={loading} className="btn w-full disabled:opacity-50">{loading ? '保存中..' : (editing ? '保存修改' : '创建门店')}</button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="删除门店">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">此操作将删除门店及其所有数据（记账、盘点、工资等），不可恢复。请输入管理员密码确认：</p>
          <input type="password" value={deletePwd} onChange={e => setDeletePwd(e.target.value)} className={inputCls} placeholder="管理员密码" />
          <div className="flex gap-2">
            <button onClick={() => setDeleteId(null)} className="btn-ghost flex-1">取消</button>
            <button onClick={handleDelete} className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-medium text-white hover:bg-rose-600">确认删除</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}