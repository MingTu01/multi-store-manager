import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Power, Camera, Upload, Clock, Lock, ChevronDown, ChevronUp } from 'lucide-react';

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
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => setStore(d)).catch(() => {});
    api.get('/stores/' + storeId + '/shifts?page=' + page + '&pageSize=10').then((d) => setShifts(d.shifts || [])).catch(() => {});
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
      await api.post('/stores/' + storeId + '/shifts/open', { handover, photos });
      setShowOpen(false); setHandover(''); setPhotos([]);
      load();
    } catch (e: any) { alert(e.message || '开店失败'); }
    finally { setSaving(false); }
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/shifts/close', { handover, photos });
      setShowClose(false); setHandover(''); setPhotos([]);
      load();
    } catch (e: any) { alert(e.message || '闭店失败'); }
    finally { setSaving(false); }
  };

  const isOpen = store?.is_open === 1;

  const renderCameraButtons = () => (
    <div>
      <label className="mb-1 block text-xs text-slate-500">拍照</label>
      <div className="flex gap-2">
        <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.capture = 'environment'; fileRef.current.click(); } }} className="btn-ghost flex-1 text-xs"><Camera className="mr-1 inline h-4 w-4" />拍照</button>
        <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.removeAttribute('capture'); fileRef.current.multiple = true; fileRef.current.click(); } }} className="btn-ghost flex-1 text-xs"><Upload className="mr-1 inline h-4 w-4" />上传</button>
      </div>
      <input ref={fileRef} type="file" onChange={handlePhoto} className="hidden" />
      {photos.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto">{photos.map((p, i) => <img key={i} src={p} className="h-16 w-16 rounded-lg object-cover" />)}</div>}
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
            <div key={s.id} className="px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
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
                  {s.handover && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{s.handover}</div>}
                  {s.photos && s.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {s.photos.map((p: string, i: number) => <img key={i} src={p} className="h-20 w-20 rounded-lg object-cover" />)}
                    </div>
                  )}
                  {!s.handover && (!s.photos || s.photos.length === 0) && (
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

  if (!isOpen) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <Lock className="mb-4 h-16 w-16 text-slate-300" />
        <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
        <div className="mb-6 text-sm text-slate-500">{dateStr} {weekStr}</div>
        <p className="mb-6 text-sm text-slate-400">门店当前已关闭</p>
        <button onClick={() => setShowOpen(true)} className="btn px-8"><Power className="mr-2 h-4 w-4" />开店</button>
        <div className="mt-8 w-full max-w-md">{renderShifts()}</div>
        <Modal open={showOpen} onClose={() => { setShowOpen(false); setPhotos([]); setHandover(''); }} title="确认开店">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-slate-500">交接内容</label>
              <textarea value={handover} onChange={(e) => setHandover(e.target.value)} className="input min-h-[80px]" placeholder="开店备注.." />
            </div>
            {renderCameraButtons()}
            <button onClick={handleOpen} disabled={saving} className="btn w-full">{saving ? '提交中..' : '确认开店'}</button>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="开闭店" />
      <GlassCard className="p-6 text-center">
        <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
        <div className="mb-4 text-sm text-slate-500">{dateStr} {weekStr}</div>
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-600">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />营业中
        </div>
        <div>
          <button onClick={() => setShowClose(true)} className="btn bg-rose-500 hover:bg-rose-600"><Power className="mr-2 h-4 w-4" />闭店</button>
        </div>
      </GlassCard>
      {renderShifts()}
      <Modal open={showClose} onClose={() => { setShowClose(false); setPhotos([]); setHandover(''); }} title="确认闭店">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">交接内容</label>
            <textarea value={handover} onChange={(e) => setHandover(e.target.value)} className="input min-h-[80px]" placeholder="闭店备注..." />
          </div>
          {renderCameraButtons()}
          <button onClick={handleClose} disabled={saving} className="btn w-full bg-rose-500 hover:bg-rose-600">{saving ? '提交中..' : '确认闭店'}</button>
        </div>
      </Modal>
    </div>
  );
}
