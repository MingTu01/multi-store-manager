// VITE_BUILD_VERIFY_20260610_205500
import { useParams } from 'react-router-dom';
import { handleImageFiles } from '../../lib/image';
import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Power, Camera, Upload, Clock, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { ImagePreview } from '../../components/ImagePreview';

export default function StoreShiftsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [handover, setHandover] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [loadedPhotos, setLoadedPhotos] = useState<Record<number, string[]>>({});
  const [lastHandover, setLastHandover] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadShiftPhotos = async (shiftId: number) => {
    if (loadedPhotos[shiftId]) return;
    try {
      const d = await api.get('/stores/' + storeId + '/shifts/' + shiftId);
      setLoadedPhotos((prev) => ({ ...prev, [shiftId]: d.photos || [] }));
    } catch {}
  };

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => setStore(d)).catch(() => {});
    api.get('/stores/' + storeId + '/shifts?page=' + page + '&pageSize=10').then((d) => setShifts(d.shifts || [])).catch(() => {});
    api.get('/stores/' + storeId + '/shifts/last-close-handover').then((d: any) => setLastHandover(d.handover || '')).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId, page]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekStr = '星期' + weekdays[now.getDay()];

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => setPhotos((p) => [...p, reader.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/shifts/open', { photos });
      setShowOpen(false); setPhotos([]);
      setTimeout(() => location.reload(), 500);
    } catch (e: any) { alert(e.message || '开店失败'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/shifts/close', { handover_content: handover, photos });
      setShowClose(false); setHandover(''); setPhotos([]);
      setTimeout(() => location.reload(), 500);
    } catch (e: any) { alert(e.message || '闭店失败'); }
    finally { setSaving(false); }
  };

  const isOpen = true; // StoreGuard already verifies store is open

  const renderCameraButtons = () => (
    <div>
      <label className="mb-1 block text-xs text-slate-500">拍照</label>
      <div className="flex gap-2">
        <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.capture = 'environment'; fileRef.current.click(); } }} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"><Camera className="h-4 w-4" />拍照</button>
        <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.removeAttribute('capture'); fileRef.current.multiple = true; fileRef.current.click(); } }} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"><Upload className="h-4 w-4" />上传</button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
      {photos.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto">{photos.map((p, i) => <img key={i} src={p} className="h-16 w-16 rounded-lg object-cover shrink-0"  loading="lazy" />)}</div>}
    </div>
  );

  const renderShifts = () => (
    <>
      <h3 className="mb-3 text-sm font-semibold text-slate-700">开闭店记录</h3>
      {shifts.length === 0 ? (
        <GlassCard className="py-8 text-center text-sm text-slate-400">暂无记录</GlassCard>
      ) : (
        <GlassCard className="divide-y divide-slate-100">
          {shifts.map((s: any) => (
            <div key={s.id} className="px-4 py-3 cursor-pointer" onClick={() => { const newId = expandedId === s.id ? null : s.id; setExpandedId(newId); if (newId && !loadedPhotos[s.id]) loadShiftPhotos(s.id); }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={'rounded-full px-2 py-0.5 text-xs ' + (s.type === 'open' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600')}>
                    {s.type === 'open' ? '开店' : '闭店'}
                  </span>
                  {s.user_name && <span className="text-xs text-slate-500">{s.user_name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{s.created_at}</span>
                  {expandedId === s.id ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                </div>
              </div>
              {expandedId === s.id && (
                <div className="mt-3 space-y-2">
                  {s.handover_content && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{s.handover_content}</div>}
                  {loadedPhotos[s.id] && loadedPhotos[s.id].length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">{loadedPhotos[s.id]?.map((p: string, i: number) => <img key={i} src={p} className="h-20 w-20 rounded-lg object-cover shrink-0"  loading="lazy" />)}</div>
                  )}
                  {!s.handover_content && (!loadedPhotos[s.id] || loadedPhotos[s.id].length === 0) && (
                    <div className="text-xs text-slate-400">无交接内容</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </GlassCard>
      )}
    </>
  );

  // 霸屏页面（门店关闭）
  if (!isOpen) {
    return (
      <>
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
          <Lock className="mb-4 h-16 w-16 text-slate-300" />
          <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
          <div className="mb-6 text-sm text-slate-500">{dateStr} {weekStr}</div>
          <p className="mb-6 text-sm text-slate-400">门店当前已关闭</p>
          <button onClick={() => setShowOpen(true)} className="flex items-center gap-2 rounded-xl bg-indigo-500 px-8 py-3 text-sm font-medium text-white shadow-lg hover:bg-indigo-600 transition-all"><Power className="h-4 w-4" />开始营业</button>
        </div>
        
        {/* 确认开店弹窗 */}
        <Modal open={showOpen} onClose={() => { setShowOpen(false); setPhotos([]); }} title="确认开店">
          <div className="space-y-4">
            {lastHandover && (
              <div className="rounded-xl bg-amber-50 p-3">
                <div className="mb-1 text-xs font-medium text-amber-700">上次交接内容</div>
                <div className="text-sm text-amber-900">{lastHandover}</div>
              </div>
            )}
            {renderCameraButtons()}
            <button onClick={handleOpen} disabled={saving || photos.length === 0} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">{saving ? "提交中..." : "确认开店"}</button>
          </div>
        </Modal>
      </>
    );
  }

  // 正常页面（门店已开）
  return (
    <div className="space-y-4">
      <PageHeader title={"开闭店"} />
      <GlassCard className="p-6 text-center">
        <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
        <div className="mb-4 text-sm text-slate-500">{dateStr} {weekStr}</div>
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />营业中
        </div>
        <div className="flex justify-center">
          <button onClick={() => setShowClose(true)} className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600 transition-all">
            <div className="flex flex-col items-center gap-1">
              <Power className="h-6 w-6" />
              <span className="text-xs font-medium">闭店</span>
            </div>
          </button>
        </div>
      </GlassCard>
      {renderShifts()}
      
      {/* 确认闭店弹窗 */}
      <Modal open={showClose} onClose={() => { setShowClose(false); setPhotos([]); setHandover(''); }} title={"确认闭店"}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">交接内容（选填）</label>
            <textarea value={handover} onChange={(e) => setHandover(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 min-h-[80px]" placeholder={"闭店备注..."} />
          </div>
          {renderCameraButtons()}
          <button onClick={handleClose} disabled={saving} className="w-full rounded-xl bg-rose-500 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50">{saving ? '提交中...' : '确认闭店'}</button>
        </div>
      </Modal>
    </div>
  );
}
