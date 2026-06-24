import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useStore } from '../stores/data';
import { canAccess } from '../lib/permissions';
import { Power, Camera, Upload, Lock, ArrowLeft } from 'lucide-react';
import { uploadImage } from '../lib/image';
import { safeImageUrl } from '../lib/image';
import { GlassCard } from './GlassCard';
import { Modal } from './Modal';
import { showToast } from './Toast';

export function StoreGuard({ children }: { children: React.ReactNode }) {
  const { storeId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());
  const [shifts, setShifts] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => { setStore(d); setLoading(false); }).catch(() => setLoading(false));
    api.get('/stores/' + storeId + '/shifts?page=1&pageSize=5').then((d: any) => setShifts(d.shifts || [])).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // 未登录用户重定向到登录页
  const storeLoading = useStore((s) => s.loading);
  if (storeLoading) return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;

  // 角色权限检查：根据路径判断所需权限
  const path = location.pathname;
  const permMap: [string, string][] = [
    ['/entries', 'storeEntries'],
    ['/inventory', 'storeInventory'],
    ['/shifts', 'storeShifts'],
    ['/payroll', 'storePayroll'],
    ['/dividends', 'storeDividends'],
    ['/staff', 'storeStaff'],
    ['/report', 'storeReport'],
    ['/logs', 'storeLogs'],
    ['/settings', 'storeSettings'],
    ['/notifications', 'storeNotifications'],
    ['/notification-settings', 'storeNotificationSettings'],
    ['/purchase', 'storePurchase'],
    ['/account', 'storeAccount'],
  ];
  let permKey = 'storeOverview';
  for (const [suffix, key] of permMap) {
    // Match /store/:id/suffix or /store/:id/suffix/xxx
    const pattern = '/store/' + storeId + suffix;
    if (path === pattern || path.startsWith(pattern + '/')) {
      permKey = key;
      break;
    }
  }
  if (user && !canAccess(permKey, user.role)) {
    return <Navigate to="/" replace />;
  }

  const isOpen = store?.is_open === 1;
  const lastCloseShift = shifts.find((s: any) => s.type === 'close');
  const lastHandover = lastCloseShift?.handover_content || '';

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekStr = '星期' + weekdays[now.getDay()];

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const url = await uploadImage(file, api, 'shifts');
        setPhotos((p) => [...p, url]);
      } catch (err: any) { showToast(err.message || '上传失败', 'error'); }
    }
  };

  const handleOpen = async () => {
    setSaving(true);
    try {
      await api.post('/stores/' + storeId + '/shifts/open', { photos });
      setShowOpen(false); setPhotos([]);
      setTimeout(() => { setShowOpen(false); setPhotos([]); load(); }, 500);
    } catch (e: any) { showToast(e.message || '开店失败', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );

  if (!isOpen) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50/30 overflow-hidden">
        <Lock className="mb-4 h-16 w-16 text-slate-300" />
        <div className="mb-1 text-4xl font-mono font-bold text-slate-800">{timeStr}</div>
        <div className="mb-2 text-sm text-slate-500">{dateStr} {weekStr}</div>
        <p className="mb-6 text-sm text-slate-400">门店当前已关闭</p>
        <button onClick={() => setShowOpen(true)} className="flex items-center gap-2 rounded-xl bg-indigo-500 px-8 py-3 text-sm font-medium text-white shadow-lg hover:bg-indigo-600 transition-all">
          <Power className="h-4 w-4" />开店
        </button>



        <Modal open={showOpen} onClose={() => { setShowOpen(false); setPhotos([]); }} title="确认开店">
          <div className="space-y-4">
            {lastHandover && (
              <div className="rounded-xl bg-amber-50 p-3">
                <div className="mb-1 text-xs font-medium text-amber-700">上次交接内容</div>
                <div className="text-sm text-amber-900">{lastHandover}</div>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-slate-500">拍照（必填）</label>
              <div className="flex gap-2">
                <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.capture = 'environment'; fileRef.current.click(); } }} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"><Camera className="h-4 w-4" />拍照</button>
                <button onClick={() => { if (fileRef.current) { fileRef.current.accept = 'image/*'; fileRef.current.removeAttribute('capture'); fileRef.current.multiple = true; fileRef.current.click(); } }} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs text-slate-600 hover:bg-slate-50"><Upload className="h-4 w-4" />上传</button>
              </div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
              {photos.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto">{photos.map((p, i) => <img key={i} src={safeImageUrl(p)} className="h-16 w-16 rounded-lg object-cover shrink-0"  loading="lazy" />)}</div>}
            </div>
            <button onClick={handleOpen} disabled={saving || photos.length === 0} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">{saving ? '提交中...' : '确认开店'}</button>
          </div>
        </Modal>
      </div>
    );
  }

  return <>{children}</>;
}
