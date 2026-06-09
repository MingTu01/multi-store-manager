import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Plus, Camera, Upload, CheckCircle, AlertTriangle, XCircle, Trash2 } from 'lucide-react';

export default function StoreInventoryPage() {
  const { storeId } = useParams();
  const [checks, setChecks] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [activeCheck, setActiveCheck] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', expected: '', actual: '', consumption: '', note: '', status: 'normal', photo: '' });
  const [showItemModal, setShowItemModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId + '/inventory').then((d) => setChecks(d.checks || [])).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId]);

  const loadCheck = async (id: number) => {
    const d = await api.get('/stores/' + storeId + '/inventory/' + id);
    setActiveCheck(d.check);
    setItems(d.items || []);
  };

  const createCheck = async () => {
    const d = await api.post('/stores/' + storeId + '/inventory', {});
    setShowModal(false);
    load();
    if (d.check) loadCheck(d.check.id);
  };

  const addItem = async () => {
    if (!activeCheck || !form.name) return;
    await api.post('/stores/' + storeId + '/inventory/' + activeCheck.id + '/items', {
      name: form.name,
      expected_qty: parseFloat(form.expected) || 0,
      actual_qty: parseFloat(form.actual) || 0,
      consumption: parseFloat(form.consumption) || 0,
      note: form.note,
      status: form.status,
      photo: form.photo,
    });
    setShowItemModal(false);
    setForm({ name: '', expected: '', actual: '', consumption: '', note: '', status: 'normal', photo: '' });
    loadCheck(activeCheck.id);
  };

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo: reader.result as string });
    reader.readAsDataURL(file);
  };

  const statusLabel = (s: string) => {
    const m: Record<string, { label: string; color: string; icon: any }> = {
      normal: { label: '正常', color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
      diff: { label: '差异', color: 'bg-amber-50 text-amber-600', icon: AlertTriangle },
      lost: { label: '丢失', color: 'bg-rose-50 text-rose-600', icon: XCircle },
      scrap: { label: '报废', color: 'bg-slate-100 text-slate-600', icon: Trash2 },
    };
    return m[s] || m.normal;
  };

  return (
    <div className="space-y-4">
      <PageHeader title="盘点" action={
        <button onClick={() => setShowModal(true)} className="btn text-sm"><Plus className="mr-1 h-4 w-4" />新建盘点</button>
      } />

      {activeCheck ? (
        <div className="space-y-3">
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">盘点 #{activeCheck.id}</div>
                <div className="text-xs text-slate-400">{activeCheck.created_at}</div>
              </div>
              <button onClick={() => setActiveCheck(null)} className="text-xs text-indigo-500">返回列表</button>
            </div>
          </GlassCard>

          <button onClick={() => setShowItemModal(true)} className="btn w-full text-sm"><Plus className="mr-1 h-4 w-4" />添加盘点项</button>

          {items.length === 0 ? (
            <GlassCard className="py-8 text-center text-sm text-slate-400">暂无盘点项</GlassCard>
          ) : (
            <div className="space-y-2">
              {items.map((item: any) => {
                const st = statusLabel(item.status);
                return (
                  <GlassCard key={item.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{item.name}</div>
                        <div className="mt-1 flex gap-3 text-xs text-slate-500">
                          <span>预期: {item.expected_qty}</span>
                          <span>实际: {item.actual_qty}</span>
                          {item.consumption > 0 && <span>消耗: {item.consumption}</span>}
                        </div>
                        {item.note && <div className="mt-1 text-xs text-slate-400">{item.note}</div>}
                      </div>
                      <span className={'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ' + st.color}>
                        <st.icon className="h-3 w-3" />{st.label}
                      </span>
                    </div>
                    {item.photo && <img src={item.photo} alt="盘点照片" className="mt-2 h-20 w-20 rounded-lg object-cover" />}
                  </GlassCard>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {checks.length === 0 ? (
            <GlassCard className="py-12 text-center text-sm text-slate-400">暂无盘点记录</GlassCard>
          ) : (
            <GlassCard className="divide-y divide-slate-100">
              {checks.map((c: any) => (
                <button key={c.id} onClick={() => loadCheck(c.id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/30">
                  <div>
                    <div className="text-sm font-medium text-slate-800">盘点 #{c.id}</div>
                    <div className="text-xs text-slate-400">{c.items_count || 0} 项 · {c.created_at}</div>
                  </div>
                  <span className={'rounded-full px-2 py-0.5 text-xs ' + (c.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                    {c.status === 'completed' ? '已完成' : '进行中'}
                  </span>
                </button>
              ))}
            </GlassCard>
          )}
        </>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title="新建盘点">
        <p className="mb-4 text-sm text-slate-600">确认创建新的盘点任务？</p>
        <button onClick={createCheck} className="btn w-full">确认创建</button>
      </Modal>

      <Modal open={showItemModal} onClose={() => setShowItemModal(false)} title="添加盘点项">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">物品名称</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="输入物品名称" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">预期数量</label>
              <input type="number" value={form.expected} onChange={(e) => setForm({ ...form, expected: e.target.value })} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">实际数量</label>
              <input type="number" value={form.actual} onChange={(e) => setForm({ ...form, actual: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">消耗量</label>
            <input type="number" value={form.consumption} onChange={(e) => setForm({ ...form, consumption: e.target.value })} className="input" placeholder="0" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">状态</label>
            <div className="flex gap-2">
              {[{ v: 'normal', l: '正常' }, { v: 'diff', l: '差异' }, { v: 'lost', l: '丢失' }, { v: 'scrap', l: '报废' }].map((s) => (
                <button key={s.v} onClick={() => setForm({ ...form, status: s.v })}
                  className={'rounded-lg px-3 py-1.5 text-xs ' + (form.status === s.v ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600')}>
                  {s.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">备注</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">拍照/上传</label>
            <div className="flex gap-2">
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.capture = 'environment'; fileRef.current.click(); } }}
                className="btn-ghost flex-1 text-xs"><Camera className="mr-1 inline h-4 w-4" />拍照</button>
              <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.removeAttribute('capture'); fileRef.current.click(); } }}
                className="btn-ghost flex-1 text-xs"><Upload className="mr-1 inline h-4 w-4" />上传</button>
            </div>
            <input ref={fileRef} type="file" onChange={handlePhoto} className="hidden" />
            {form.photo && <img src={form.photo} alt="preview" className="mt-2 h-20 w-20 rounded-lg object-cover" />}
          </div>
          <button onClick={addItem} className="btn w-full">添加</button>
        </div>
      </Modal>
    </div>
  );
}
