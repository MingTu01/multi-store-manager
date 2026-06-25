import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useStore } from '../../stores/data';
import { uploadImage } from '../../lib/image';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { ImagePreview } from '../../components/ImagePreview';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { FloatingActionButton } from '../../components/FloatingActionButton';
import {
  Plus, Camera, Upload, CheckCircle, AlertTriangle, XCircle, Trash2, Edit3,
  GripVertical, ArrowUp, ArrowDown, ArrowLeft, ChevronRight, RotateCcw, Loader2
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { VirtualList } from '../../components/VirtualList';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type InventoryItem = {
  id: number;
  name: string;
  photo: string;
  quantity: number;
  sort_order: number;
  status?: string;
};

type StatusType = 'normal' | 'diff' | 'lost' | 'scrap' | 'empty' | 'restocking' | 'pending';

const STATUS_MAP: Record<StatusType, { label: string; color: string; icon: any }> = {
  normal: { label: '正常', color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
  diff: { label: '差异', color: 'bg-amber-50 text-amber-600', icon: AlertTriangle },
  lost: { label: '丢失', color: 'bg-rose-50 text-rose-600', icon: XCircle },
  scrap: { label: '报废', color: 'bg-slate-100 text-slate-600', icon: Trash2 },
  empty: { label: '空', color: 'bg-slate-100 text-slate-500', icon: XCircle },
  restocking: { label: '补货中', color: 'bg-blue-50 text-blue-600', icon: AlertTriangle },
  pending: { label: '待补货', color: 'bg-orange-50 text-orange-600', icon: AlertTriangle },
};

const STATUS_OPTIONS: { v: StatusType; l: string }[] = [
  { v: 'normal', l: '正常' },
  { v: 'diff', l: '差异' },
  { v: 'lost', l: '丢失' },
  { v: 'scrap', l: '报废' },
  { v: 'empty', l: '空' },
  { v: 'restocking', l: '补货中' },
];


const STATUS_CN_MAP: Record<string, StatusType> = {
  '正常': 'normal', '差异': 'diff', '丢失': 'lost', '报废': 'scrap',
  '空': 'empty', '补货中': 'restocking', '待补货': 'pending',
};
function resolveStatus(s: string | undefined): StatusType {
  if (!s) return 'normal';
  if (STATUS_MAP[s as StatusType]) return s as StatusType;
  return STATUS_CN_MAP[s] || 'normal';
}

const VIRTUAL_THRESHOLD = 30;

function SortableItem({ id, children }: { id: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform) || undefined, transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined };
  return <div ref={setNodeRef} style={style}>{children}</div>;
}
function SortableDragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({ id });
  return <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none select-none p-1 rounded hover:bg-slate-100"><GripVertical className="h-5 w-5 text-slate-300" /></div>;
}

export default function StoreInventoryPage() {
  const { storeId } = useParams();
  const user = useStore((s) => s.user);
  const isReadonly = user?.role === 'SHAREHOLDER' || user?.role === 'STAFF';
  const [items, setItems] = useState<InventoryItem[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }));
  const [showTakeout, setShowTakeout] = useState<InventoryItem | null>(null);
  const [takeoutQty, setTakeoutQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditItem, setShowEditItem] = useState<InventoryItem | null>(null);
  const [addForm, setAddForm] = useState({ name: '', quantity: '', photo: '' });
  const [editForm, setEditForm] = useState({ name: '', quantity: '', photo: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  // Inventory check state
  const [checkActive, setCheckActive] = useState(false);
  const [checkIndex, setCheckIndex] = useState(0);
  const [lastCheckResults, setLastCheckResults] = useState<Record<number, { expected: number; consumption: number; actual: number; status: StatusType }>>({});
  
  const [checkResults, setCheckResults] = useState<Record<number, {
    consumption: number;
    actual: number;
    status: StatusType;
  }>>({});
  const [checkForm, setCheckForm] = useState({ consumption: '', actual: '', status: 'normal' as StatusType });
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [savingCheck, setSavingCheck] = useState(false);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setItems(prev => {
        const oi = prev.findIndex(i => i.id === active.id);
        const ni = prev.findIndex(i => i.id === over.id);
        const r = arrayMove(prev, oi, ni);
        api.post('/stores/' + storeId + '/inventory/items/reorder', { order: r.map((it, idx) => ({ id: it.id, sort_order: idx })) }).catch(() => {});
        return r;
      });
    }
  };
  const handleTakeout = async () => {
    if (!showTakeout || !takeoutQty) return;
    try {
      const r: any = await api.post('/stores/' + storeId + '/inventory/items/' + showTakeout.id + '/takeout', { quantity: Number(takeoutQty) });
      setShowTakeout(null); setTakeoutQty(''); loadItems(); alert(r.message || '领出成功');
    } catch (e: any) { alert(e.message || '领出失败'); }
  };

  const loadItems = () => {
    if (!storeId) return;
    setLoading(true);
    api.get('/stores/' + storeId + '/inventory')
      .then((d) => {
        const list = d.items || [];
        setItems(Array.isArray(list) ? list : []);
        // 加载最近一次盘点结果
        const checks = d.checks || [];
        if (checks.length > 0 && checks[0].status === 'completed') {
          api.get('/stores/' + storeId + '/inventory/checks/' + checks[0].id)
            .then((detail) => {
              const results: Record<number, { expected: number; consumption: number; actual: number; status: StatusType }> = {};
              (detail.items || []).forEach((item: any) => {
                const currentItem = list.find((it: any) => it.id === item.master_id);
                if (currentItem && currentItem.quantity !== (item.actual_qty || 0)) return;
                results[item.master_id] = {
                  expected: item.expected_qty,
                  consumption: item.consumption || 0,
                  actual: item.actual_qty || 0,
                  status: resolveStatus(item.status)
                };
              });
              setLastCheckResults(results);
            })
            .catch(() => {});
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadItems(); }, [storeId]);

  // --- Add Item ---
  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file, api, 'inventory');
      setAddForm((f) => ({ ...f, photo: url }));
    } catch (err: any) { alert(err.message || '上传失败'); }
  };

  const handleAddItem = async () => {
    if (!addForm.name) return;
    try {
      await api.post('/stores/' + storeId + '/inventory/items', {
        name: addForm.name,
        quantity: parseFloat(addForm.quantity) || 0,
        photo: addForm.photo,
        sort_order: items.length,
      });
      setShowAddItem(false);
      setAddForm({ name: '', quantity: '', photo: '' });
      loadItems();
    } catch (e: any) {
      alert(e.message || '添加失败');
    }
  };

  // --- Edit Item ---
  const openEdit = (item: InventoryItem) => {
    setShowEditItem(item);
    setEditForm({ name: item.name, quantity: String(item.quantity), photo: item.photo || '' });
  };

  const handleEditPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImage(file, api, 'inventory');
      setEditForm((f) => ({ ...f, photo: url }));
    } catch (err: any) { alert(err.message || '上传失败'); }
  };

  const handleSaveEdit = async () => {
    if (!showEditItem) return;
    try {
      const newQty = parseFloat(editForm.quantity) || 0;
      const autoSt = newQty <= 0 ? 'restocking' : 'normal';
      await api.put('/stores/' + storeId + '/inventory/items/' + showEditItem.id, {
        name: editForm.name,
        quantity: newQty,
        photo: editForm.photo,
        status: autoSt,
      });
      setShowEditItem(null);
      loadItems();
    } catch (e: any) {
      alert(e.message || '保存失败');
    }
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('确定删除该物品？')) return;
    try {
      await api.del('/stores/' + storeId + '/inventory/items/' + id);
      loadItems();
    } catch (e: any) {
      alert(e.message || '删除失败');
    }
  };

  // --- Reorder ---
  const startCheck = () => {
    if (items.length === 0) {
      alert('请先添加物品');
      return;
    }
    setCheckActive(true);
    setCheckIndex(0);
    setCheckResults({});
    const first = items[0];
    setCheckForm({
      consumption: '',
      actual: '',
      status: calcAutoStatus(first.quantity, 0, 0),
    });
  };

  const calcAutoStatus = (expected: number, consumption: number, actual: number): StatusType => {
    if (consumption + actual === expected) return 'normal';
    return 'diff';
  };

  const currentItem = items[checkIndex];

  useEffect(() => {
    if (!checkActive || !currentItem) return;
    const r = checkResults[currentItem.id];
    if (r) {
      setCheckForm({
        consumption: String(r.consumption),
        actual: String(r.actual),
        status: r.status,
      });
    } else {
      setCheckForm({
        consumption: '',
        actual: '',
        status: calcAutoStatus(currentItem.quantity, 0, 0),
      });
    }
  }, [checkActive, checkIndex, currentItem?.id]);

  const handleCheckInputChange = (field: string, value: string) => {
    const updated = { ...checkForm, [field]: value };
    if (field !== 'status' && currentItem) {
      const c = parseFloat(updated.consumption) || 0;
      const a = parseFloat(updated.actual) || 0;
      updated.status = calcAutoStatus(currentItem.quantity, c, a);
    }
    setCheckForm(updated);
  };

  const saveCurrentCheck = () => {
    if (!currentItem) return;
    setCheckResults((prev) => ({
      ...prev,
      [currentItem.id]: {
        consumption: parseFloat(checkForm.consumption) || 0,
        actual: parseFloat(checkForm.actual) || 0,
        status: checkForm.status,
      },
    }));
  };

  const goNext = () => {
    saveCurrentCheck();
    if (checkIndex < items.length - 1) {
      setCheckIndex(checkIndex + 1);
    } else {
      setShowCompleteConfirm(true);
    }
  };

  const goPrev = () => {
    saveCurrentCheck();
    if (checkIndex > 0) setCheckIndex(checkIndex - 1);
  };

  const completeCheck = async () => {
    setSavingCheck(true);
    try {
      const results = items.map((item) => {
        const r = checkResults[item.id];
        const consumption = r?.consumption || 0;
        const actual = r?.actual || 0;
        const expected = item.quantity;
        let status = r?.status || 'normal';
        if (consumption + actual !== expected) status = 'diff';
        if (actual === 0 && consumption === 0) status = 'empty';
        return {
          item_id: item.id,
          name: item.name,
          expected_qty: expected,
          consumption,
          actual_qty: actual,
          status,
        };
      });
      await api.post('/stores/' + storeId + '/inventory/checks/batch-complete', { results });
      setShowCompleteConfirm(false);
      setCheckActive(false);
      setCheckResults({});
      loadItems();
    } catch (e: any) {
      alert(e.message || '提交失败');
    } finally {
      setSavingCheck(false);
    }
  };

  const cancelCheck = () => {
    if (Object.keys(checkResults).length > 0 && !confirm('确定放弃本次盘点？')) return;
    setCheckActive(false);
    setCheckResults({});
    setCheckIndex(0);
  };

  // --- Render: Inventory Check Mode ---
  if (checkActive && currentItem) {
    const st = STATUS_MAP[checkForm.status];
    const StIcon = st.icon;
    const expected = currentItem.quantity;
    const consumption = parseFloat(checkForm.consumption) || 0;
    const actual = parseFloat(checkForm.actual) || 0;
    const isBalanced = consumption + actual === expected;
    const progress = ((checkIndex + 1) / items.length) * 100;

    return (
      <div className="space-y-4">
        <PageHeader title="盘点中" />

        {/* Progress bar */}
        <GlassCard className="p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>{checkIndex + 1} / {items.length}</span>
            <button onClick={cancelCheck} className="action-btn text-rose-500 hover:text-rose-600">取消盘点</button>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-indigo-500 transition-all" style={{ width: progress + '%' }} />
          </div>
        </GlassCard>

        {/* Current item card */}
        <GlassCard className="p-5">
          <div className="mb-4 flex items-center gap-4">
            {currentItem.photo ? (
              <ImagePreview src={currentItem.photo} className="h-20 w-20"><img src={currentItem.photo} alt={currentItem.name} className="h-20 w-20 rounded-xl object-cover"  loading="lazy" /></ImagePreview>
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-indigo-50 text-2xl font-bold text-indigo-400">
                {currentItem.name[0]}
              </div>
            )}
            <div>
              <div className="text-lg font-semibold text-slate-900">{currentItem.name}</div>
              <div className="mt-1 text-sm text-slate-500">预期库存: <span className="font-medium text-slate-700">{expected}</span></div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">消耗</label>
                <input
                  type="number"
                  value={checkForm.consumption}
                  onChange={(e) => handleCheckInputChange('consumption', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="0"
                  min="0"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">实际数量</label>
                <input
                  type="number"
                  value={checkForm.actual}
                  onChange={(e) => handleCheckInputChange('actual', e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="0"
                  min="0"
                />
              </div>
            </div>

            {/* Status indicator */}
            <div className={'flex items-center gap-2 rounded-xl px-3 py-2 ' + (isBalanced ? 'bg-emerald-50' : 'bg-amber-50')}>
              <StIcon className={'h-4 w-4 ' + (isBalanced ? 'text-emerald-500' : 'text-amber-500')} />
              <span className={'text-sm font-medium ' + (isBalanced ? 'text-emerald-600' : 'text-amber-600')}>
                {isBalanced ? '数量正常' : '存在差异 (差 ' + (expected - consumption - actual) + ')'}
              </span>
            </div>

            {/* Manual status override */}
            <div>
              <label className="mb-1 block text-xs text-slate-500">手动设置状态</label>
              <div className="flex gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.v}
                    onClick={() => setCheckForm((f) => ({ ...f, status: s.v }))}
                    className={'rounded-lg px-3 py-1.5 text-xs transition-all ' +
                      (checkForm.status === s.v ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={goPrev}
            disabled={checkIndex === 0}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white py-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />上一项
          </button>
          <button
            onClick={goNext}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-indigo-500 py-3 text-sm font-medium text-white hover:bg-indigo-600"
          >
            {checkIndex === items.length - 1 ? '完成盘点' : '下一项'}<ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Complete confirmation */}
        <Modal open={showCompleteConfirm} onClose={() => setShowCompleteConfirm(false)} title="确认盘点完成">
          <div className="space-y-4">
            <p className="text-sm text-slate-600">已完成所有物品的盘点，提交后系统库存将更新为实际数量。</p>
            <div className="space-y-2">
              {items.map((item) => {
                const r = checkResults[item.id];
                const s = r ? STATUS_MAP[resolveStatus(r.status)] : STATUS_MAP.normal;
                return (
                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-700">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{item.quantity} → {r?.actual ?? '?'}</span>
                      <span className={'rounded-full px-2 py-0.5 text-xs ' + s.color}>{s.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCompleteConfirm(false)} className="action-btn flex-1 rounded-xl border border-slate-200 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                返回修改
              </button>
              <button onClick={completeCheck} disabled={savingCheck} className="action-btn flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
                {savingCheck ? '提交中...' : '确认提交'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // --- Render: Items List ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="盘点" />
        {!isReadonly && (
        <div className="hidden items-center gap-2 lg:flex">
          <button onClick={() => setShowAddItem(true)} className="action-btn inline-flex items-center gap-1 rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus className="h-4 w-4" />添加物品
          </button>
          <button onClick={startCheck} className="action-btn inline-flex items-center gap-1 rounded-xl bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-600">
            <RotateCcw className="h-4 w-4" />开始盘点
          </button>
        </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : items.length === 0 ? (
        <GlassCard className="py-12 text-center">
          <RotateCcw className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          <div className="text-sm text-slate-400">暂无物品，点击下方按钮添加</div>
        </GlassCard>
      ) : items.length >= VIRTUAL_THRESHOLD ? (
          <VirtualList
            items={items}
            overscan={3}
            emptyContent={
              <GlassCard className="py-12 text-center">
                <RotateCcw className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <div className="text-sm text-slate-400">暂无物品，点击下方按钮添加</div>
              </GlassCard>
            }
            renderItem={(item, index) => {
              const result = checkResults[item.id];
              const st = result ? STATUS_MAP[resolveStatus(result.status)] : null;
              const diff = result ? ((result.actual || 0) + (result.consumption || 0) - item.quantity) : 0;
              return (
                <div key={item.id} className="mb-2">
                  <GlassCard className="p-4">
                    <div className="flex items-center gap-3">
                      {item.photo ? (
                        <ImagePreview src={item.photo} className="h-14 w-14"><img src={item.photo} alt={item.name} className="h-14 w-14 rounded-xl object-cover" loading="lazy" /></ImagePreview>
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-400">{item.name[0]}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-800">{item.name}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs">
                          <span className="text-slate-400">库存: {item.quantity}</span>
                          {lastCheckResults[item.id] && (() => { const c = lastCheckResults[item.id]; const v = (c.consumption + c.actual) - c.expected; return v !== 0 ? <span className={'font-medium ' + (v > 0 ? 'text-emerald-600' : 'text-rose-500')}>{v > 0 ? '+' : ''}{v}</span> : null; })()}
                          {diff !== 0 && <span className={'font-medium ' + (diff > 0 ? 'text-emerald-600' : 'text-rose-500')}>{diff > 0 ? '+' : ''}{diff}</span>}
                        </div>
                        <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (st ? st.color : STATUS_MAP[resolveStatus(item.status)].color)}>{st ? st.label : STATUS_MAP[resolveStatus(item.status)].label}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isReadonly && <button onClick={() => { setShowTakeout(item); setTakeoutQty(''); }} className="action-btn rounded-lg px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-medium">领出</button>}
                        {!isReadonly && <button onClick={() => openEdit(item)} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Edit3 className="h-4 w-4" /></button>}
                        {!isReadonly && <button onClick={() => handleDeleteItem(item.id)} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>}
                      </div>
                    </div>
                  </GlassCard>
                </div>
              );
            }}
          />
      ) : (
          <div className="space-y-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((item, index) => {
              const hasResult = !!checkResults[item.id];
              const result = checkResults[item.id];
              const st = result ? STATUS_MAP[resolveStatus(result.status)] : null;
              const diff = result ? ((result.actual || 0) + (result.consumption || 0) - item.quantity) : 0;
              return (
                <SortableItem key={item.id} id={item.id}>
                <GlassCard className="p-4">
                  <div className="flex items-center gap-3">
                    {item.photo ? (
                      <ImagePreview src={item.photo} className="h-14 w-14"><img src={item.photo} alt={item.name} className="h-14 w-14 rounded-xl object-cover"  loading="lazy" /></ImagePreview>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50 text-lg font-bold text-indigo-400">{item.name[0]}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{item.name}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <span className="text-slate-400">库存: {item.quantity}</span>
                        {lastCheckResults[item.id] && (() => { const c = lastCheckResults[item.id]; const v = (c.consumption + c.actual) - c.expected; return v !== 0 ? <span className={'font-medium ' + (v > 0 ? 'text-emerald-600' : 'text-rose-500')}>{v > 0 ? '+' : ''}{v}</span> : null; })()}
                        {diff !== 0 && <span className={'font-medium ' + (diff > 0 ? 'text-emerald-600' : 'text-rose-500')}>{diff > 0 ? '+' : ''}{diff}</span>}
                      </div>
                      <span className={'mt-1 inline-block rounded-full px-2 py-0.5 text-xs ' + (st ? st.color : STATUS_MAP[resolveStatus(item.status)].color)}>{st ? st.label : STATUS_MAP[resolveStatus(item.status)].label}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isReadonly && <SortableDragHandle id={item.id} />}
                      {!isReadonly && <button onClick={() => { setShowTakeout(item); setTakeoutQty(''); }} className="action-btn rounded-lg px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 font-medium">领出</button>}
                      {!isReadonly && <button onClick={() => openEdit(item)} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><Edit3 className="h-4 w-4" /></button>}
                      {!isReadonly && <button onClick={() => handleDeleteItem(item.id)} className="action-btn rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>
                </GlassCard>
                </SortableItem>
              );
            })}
            </SortableContext>
            </DndContext>
          </div>
      )}

      {/* Add Item Modal */}
      <Modal open={showAddItem} onClose={() => setShowAddItem(false)} title="添加物品">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">物品名称</label>
            <input
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="输入物品名称"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">初始数量</label>
            <input
              type="number"
              value={addForm.quantity}
              onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="0"
              min="0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">物品照片</label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.accept = 'image/*';
                    fileRef.current.capture = 'environment';
                    fileRef.current.click();
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Camera className="h-4 w-4" />拍照
              </button>
              <button
                onClick={() => {
                  if (fileRef.current) {
                    fileRef.current.accept = 'image/*';
                    fileRef.current.removeAttribute('capture');
                    fileRef.current.click();
                  }
                }}
                className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Upload className="h-4 w-4" />上传
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAddPhoto} className="hidden" />
            {addForm.photo && (
              <ImagePreview src={addForm.photo} className="mt-2 h-20 w-20"><img src={addForm.photo} alt="preview" className="mt-2 h-20 w-20 rounded-lg object-cover"  loading="lazy" /></ImagePreview>
            )}
          </div>
          <button onClick={handleAddItem} className="action-btn btn w-full">添加</button>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal open={!!showEditItem} onClose={() => setShowEditItem(null)} title="编辑物品">
        {showEditItem && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">物品名称</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">当前数量</label>
              <input
                type="number"
                value={editForm.quantity}
                onChange={(e) => setEditForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                min="0"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">物品照片</label>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (editFileRef.current) {
                      editFileRef.current.accept = 'image/*';
                      editFileRef.current.capture = 'environment';
                      editFileRef.current.click();
                    }
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Camera className="h-4 w-4" />拍照
                </button>
                <button
                  onClick={() => {
                    if (editFileRef.current) {
                      editFileRef.current.accept = 'image/*';
                      editFileRef.current.removeAttribute('capture');
                      editFileRef.current.click();
                    }
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"
                >
                  <Upload className="h-4 w-4" />上传
                </button>
              </div>
              <input ref={editFileRef} type="file" accept="image/*" onChange={handleEditPhoto} className="hidden" />
              {editForm.photo && (
                <ImagePreview src={editForm.photo} className="mt-2 h-20 w-20"><img src={editForm.photo} alt="preview" className="mt-2 h-20 w-20 rounded-lg object-cover"  loading="lazy" /></ImagePreview>
              )}
            </div>
            <button onClick={handleSaveEdit} className="action-btn btn w-full">保存</button>
          </div>
        )}
      </Modal>

      {/* 领出弹窗 */}
      <Modal open={!!showTakeout} onClose={() => setShowTakeout(null)} title="领出物品">
        {showTakeout && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              {showTakeout.photo ? <ImagePreview src={showTakeout.photo} className="h-12 w-12"><img src={showTakeout.photo} className="h-12 w-12 rounded-lg object-cover"  loading="lazy" /></ImagePreview> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-lg font-bold text-indigo-400">{showTakeout.name[0]}</div>}
              <div>
                <div className="text-sm font-medium text-slate-800">{showTakeout.name}</div>
                <div className="text-xs text-slate-400">当前库存: {showTakeout.quantity}</div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">领出数量</label>
              <input type="number" value={takeoutQty} onChange={e => setTakeoutQty(e.target.value)} min="1" max={showTakeout.quantity} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300" placeholder="请输入数量" />
            </div>
            <button onClick={handleTakeout} disabled={!takeoutQty || Number(takeoutQty) <= 0} className="action-btn btn w-full disabled:opacity-50">确认领出</button>
          </div>
        )}
      </Modal>

      {/* Mobile FABs */}
      {!isReadonly &&       <FloatingActionButton label="开始盘点" icon={RotateCcw} onClick={startCheck} />}
      {!isReadonly && (
      <button
        onClick={() => setShowAddItem(true)}
        className="action-btn fixed right-4 bottom-44 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-white text-indigo-500 shadow-xl border border-indigo-100 transition-all hover:bg-indigo-50 active:scale-95 lg:hidden"
      >
        <Plus className="h-5 w-5" />
      </button>
      )}
    </div>
  );
}