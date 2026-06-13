import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { useStore } from '../../stores/data';
import { compressImage } from '../../lib/image';
import {
  Building2, Tags, Plus, Edit3, Trash2, ArrowUpCircle, ArrowDownCircle,
  Camera, Upload, Users, Save, ImageIcon, Phone, Percent, ChevronDown, ChevronUp, X,
} from 'lucide-react';

/* --- types --- */
interface Shareholder {
  id?: number;
  name: string;
  phone: string;
  ratio: number;
}

interface StoreInfo {
  id: number;
  name: string;
  address: string;
  initial_capital: number;
  status: string;
  photos: string[];
  shareholders: Shareholder[];
}

/* --- collapsible card --- */
function CollapseCard({
  title,
  icon,
  defaultOpen = true,
  children,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className="p-4">
      <div
        className="mb-2 flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen(!open)}
      >
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          {icon}
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {action}
          {open ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>
      {open && children}
    </GlassCard>
  );
}

/* --- main page --- */
export default function StoreSettingsPage() {
  const { storeId } = useParams();
  const { user } = useStore();
  const role = user?.role;
  const canEdit = role === 'ADMIN' || role === 'STORE_ADMIN';
  const canManageCategory = canEdit || role === 'MANAGER';

  /* store info */
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [infoForm, setInfoForm] = useState({ name: '', address: '', initial_capital: '', status: 'active' });
  const [savingInfo, setSavingInfo] = useState(false);

  /* photos */
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  /* shareholders */
  const [showShareholderModal, setShowShareholderModal] = useState(false);
  const [editShareholderIdx, setEditShareholderIdx] = useState<number | null>(null);
  const [shareholderForm, setShareholderForm] = useState<Shareholder>({ name: '', phone: '', ratio: 0 });
  const [savingShareholder, setSavingShareholder] = useState(false);

  /* categories */
  const [categories, setCategories] = useState<any[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<any>(null);
  const [catForm, setCatForm] = useState({ name: '', type: 'income' });
  const [savingCat, setSavingCat] = useState(false);

  /* message */
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const showMsg = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3000);
  };

  /* load data */
  const load = () => {
    if (!storeId) return;
    api
      .get('/stores/' + storeId)
      .then((d) => {
        const s: StoreInfo = d.store || d;
        setStore(s);
        setInfoForm({
          name: s.name || '',
          address: s.address || '',
          initial_capital: String(s.initial_capital ?? ''),
          status: s.status || 'active',
        });
      })
      .catch(() => {});
    api
      .get('/stores/' + storeId + '/categories')
      .then((d) => setCategories(Array.isArray(d) ? d : d.categories || []))
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, [storeId]);

  /* save basic info */
  const handleSaveInfo = async () => {
    if (!storeId) return;
    setSavingInfo(true);
    try {
      await api.put('/stores/' + storeId, {
        name: infoForm.name,
        address: infoForm.address,
        initial_capital: Number(infoForm.initial_capital) || 0,
        status: infoForm.status,
        photos: store?.photos || [],
        shareholders: store?.shareholders || [],
      });
      showMsg(true, '\u57fa\u672c\u4fe1\u606f\u4fdd\u5b58\u6210\u529f');
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSavingInfo(false);
    }
  };

  /* photo management */
  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhoto(true);
    try {
      const newPhotos: string[] = [];
      for (const file of Array.from(files)) {
        const compressed = await compressImage(file, 800, 0.6);
        newPhotos.push(compressed);
      }
      const updated = [...(store?.photos || []), ...newPhotos];
      await api.put('/stores/' + storeId, {
        name: infoForm.name,
        address: infoForm.address,
        initial_capital: Number(infoForm.initial_capital) || 0,
        status: infoForm.status,
        photos: updated,
        shareholders: store?.shareholders || [],
      });
      showMsg(true, '\u7167\u7247\u4e0a\u4f20\u6210\u529f');
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u4e0a\u4f20\u5931\u8d25');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (idx: number) => {
    if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u7167\u7247\uff1f')) return;
    try {
      const updated = (store?.photos || []).filter((_, i) => i !== idx);
      await api.put('/stores/' + storeId, {
        name: infoForm.name,
        address: infoForm.address,
        initial_capital: Number(infoForm.initial_capital) || 0,
        status: infoForm.status,
        photos: updated,
        shareholders: store?.shareholders || [],
      });
      showMsg(true, '\u7167\u7247\u5df2\u5220\u9664');
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u5220\u9664\u5931\u8d25');
    }
  };

  /* shareholder management */
  const openCreateShareholder = () => {
    setEditShareholderIdx(null);
    setShareholderForm({ name: '', phone: '', ratio: 0 });
    setShowShareholderModal(true);
  };

  const openEditShareholder = (idx: number) => {
    const sh = (store?.shareholders || [])[idx];
    setEditShareholderIdx(idx);
    setShareholderForm({ name: sh.name || '', phone: sh.phone || '', ratio: sh.ratio || 0 });
    setShowShareholderModal(true);
  };

  const handleSaveShareholder = async () => {
    if (!shareholderForm.name) {
      showMsg(false, '\u8bf7\u8f93\u5165\u80a1\u4e1c\u59d3\u540d');
      return;
    }
    setSavingShareholder(true);
    try {
      const list = [...(store?.shareholders || [])];
      if (editShareholderIdx !== null) {
        list[editShareholderIdx] = shareholderForm;
      } else {
        list.push(shareholderForm);
      }
      await api.put('/stores/' + storeId, {
        name: infoForm.name,
        address: infoForm.address,
        initial_capital: Number(infoForm.initial_capital) || 0,
        status: infoForm.status,
        photos: store?.photos || [],
        shareholders: list,
      });
      setShowShareholderModal(false);
      showMsg(true, editShareholderIdx !== null ? '\u80a1\u4e1c\u4fe1\u606f\u5df2\u66f4\u65b0' : '\u80a1\u4e1c\u5df2\u6dfb\u52a0');
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSavingShareholder(false);
    }
  };

  const handleDeleteShareholder = async (idx: number) => {
    if (!confirm('\u786e\u8ba4\u5220\u9664\u8be5\u80a1\u4e1c\uff1f')) return;
    try {
      const list = (store?.shareholders || []).filter((_, i) => i !== idx);
      await api.put('/stores/' + storeId, {
        name: infoForm.name,
        address: infoForm.address,
        initial_capital: Number(infoForm.initial_capital) || 0,
        status: infoForm.status,
        photos: store?.photos || [],
        shareholders: list,
      });
      showMsg(true, '\u80a1\u4e1c\u5df2\u5220\u9664');
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u5220\u9664\u5931\u8d25');
    }
  };

  /* category management */
  const openCreateCat = () => {
    setEditCat(null);
    setCatForm({ name: '', type: 'income' });
    setShowCatModal(true);
  };
  const openEditCat = (cat: any) => {
    setEditCat(cat);
    setCatForm({ name: cat.name || '', type: cat.type || 'income' });
    setShowCatModal(true);
  };

  const handleSaveCat = async () => {
    if (!catForm.name) return;
    setSavingCat(true);
    try {
      const body = { name: catForm.name, type: catForm.type };
      if (editCat) {
        await api.put('/stores/' + storeId + '/categories/' + editCat.id, body);
      } else {
        await api.post('/stores/' + storeId + '/categories', body);
      }
      setShowCatModal(false);
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u4fdd\u5b58\u5931\u8d25');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCat = async (id: number, name: string) => {
    if (!confirm('\u786e\u8ba4\u5220\u9664\u5206\u7c7b ' + name + ' \uff1f')) return;
    try {
      await api.del('/stores/' + storeId + '/categories/' + id);
      load();
    } catch (e: any) {
      showMsg(false, e.message || '\u5220\u9664\u5931\u8d25');
    }
  };

  const incomeCategories = categories.filter((c: any) => c.type === 'income');
  const expenseCategories = categories.filter((c: any) => c.type === 'expense');

  /* render */
  return (
    <div className="space-y-4">
      <PageHeader title="\u95e8\u5e97\u8bbe\u7f6e" subtitle={store?.name || ''} />

      {msg && (
        <div
          className={
            'rounded-xl p-3 text-sm ' +
            (msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')
          }
        >
          {msg.text}
        </div>
      )}

      {/* === 1. basic info === */}
      <CollapseCard
        title="\u57fa\u672c\u4fe1\u606f"
        icon={<Building2 className="h-4 w-4 text-indigo-500" />}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">\u95e8\u5e97\u540d\u79f0</label>
            <input
              value={infoForm.name}
              onChange={(e) => setInfoForm({ ...infoForm, name: e.target.value })}
              disabled={!canEdit}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="\u95e8\u5e97\u540d\u79f0"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">\u5730\u5740</label>
            <input
              value={infoForm.address}
              onChange={(e) => setInfoForm({ ...infoForm, address: e.target.value })}
              disabled={!canEdit}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="\u95e8\u5e97\u5730\u5740"
            />
          </div>
          {role === 'ADMIN' && (
            <>
              <div>
                <label className="mb-1 block text-xs text-slate-500">\u521d\u59cb\u8d44\u91d1</label>
                <input
                  type="number"
                  value={infoForm.initial_capital}
                  onChange={(e) => setInfoForm({ ...infoForm, initial_capital: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  placeholder="\u521d\u59cb\u8d44\u91d1"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">\u95e8\u5e97\u72b6\u6001</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setInfoForm({ ...infoForm, status: 'active' })}
                    className={
                      'flex-1 rounded-xl py-2 text-sm font-medium transition-colors ' +
                      (infoForm.status === 'active'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                    }
                  >
                    \u6b63\u5e38
                  </button>
                  <button
                    onClick={() => setInfoForm({ ...infoForm, status: 'paused' })}
                    className={
                      'flex-1 rounded-xl py-2 text-sm font-medium transition-colors ' +
                      (infoForm.status === 'paused'
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                    }
                  >
                    \u6682\u505c
                  </button>
                </div>
              </div>
            </>
          )}
          {canEdit && (
            <button
              onClick={handleSaveInfo}
              disabled={savingInfo}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingInfo ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58\u57fa\u672c\u4fe1\u606f'}
            </button>
          )}
        </div>
      </CollapseCard>

      {/* === 2. photos === */}
      <CollapseCard
        title="\u95e8\u5e97\u7167\u7247"
        icon={<ImageIcon className="h-4 w-4 text-indigo-500" />}
        defaultOpen={true}
        action={
          canEdit ? (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
              >
                <Camera className="h-3.5 w-3.5" />
                \u62cd\u7167
              </button>
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
              >
                <Upload className="h-3.5 w-3.5" />
                \u4e0a\u4f20
              </button>
            </div>
          ) : undefined
        }
      >
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handlePhotoUpload(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhotoUpload(e.target.files)}
        />

        {uploadingPhoto && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-600">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
            \u6b63\u5728\u4e0a\u4f20\u7167\u7247...
          </div>
        )}

        {store?.photos && store.photos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {store.photos.map((photo: string, idx: number) => (
              <div key={idx} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                <img src={photo} alt={'\u7167\u7247 ' + (idx + 1)} className="h-full w-full object-cover" />
                {canEdit && (
                  <button
                    onClick={() => handleDeletePhoto(idx)}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-slate-400">
            <ImageIcon className="mb-2 h-8 w-8" />
            <span className="text-sm">\u6682\u65e0\u7167\u7247</span>
          </div>
        )}
      </CollapseCard>

      {/* === 3. shareholders === */}
      <CollapseCard
        title="\u80a1\u4e1c\u4fe1\u606f"
        icon={<Users className="h-4 w-4 text-indigo-500" />}
        defaultOpen={true}
        action={
          canEdit ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCreateShareholder();
              }}
              className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" />
              \u6dfb\u52a0
            </button>
          ) : undefined
        }
      >
        {store?.shareholders && store.shareholders.length > 0 ? (
          <div className="space-y-2">
            {store.shareholders.map((sh: Shareholder, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5"
              >
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-800">{sh.name}</div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                    {sh.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {sh.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Percent className="h-3 w-3" />
                      {sh.ratio}%
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditShareholder(idx)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-indigo-100"
                    >
                      <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                    <button
                      onClick={() => handleDeleteShareholder(idx)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-slate-400">
            <Users className="mb-2 h-8 w-8" />
            <span className="text-sm">\u6682\u65e0\u80a1\u4e1c\u4fe1\u606f</span>
          </div>
        )}
      </CollapseCard>

      {/* === 4. categories === */}
      <CollapseCard
        title="\u5206\u7c7b\u7ba1\u7406"
        icon={<Tags className="h-4 w-4 text-indigo-500" />}
        defaultOpen={true}
        action={
          canManageCategory ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCreateCat();
              }}
              className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
            >
              <Plus className="h-3.5 w-3.5" />
              \u6dfb\u52a0
            </button>
          ) : undefined
        }
      >
        {incomeCategories.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <ArrowUpCircle className="h-3.5 w-3.5" />
              \u6536\u5165\u5206\u7c7b
            </div>
            <div className="space-y-2">
              {incomeCategories.map((cat: any) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                  {canManageCategory && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditCat(cat)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-emerald-100"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteCat(cat.id, cat.name)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {expenseCategories.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <ArrowDownCircle className="h-3.5 w-3.5" />
              \u652f\u51fa\u5206\u7c7b
            </div>
            <div className="space-y-2">
              {expenseCategories.map((cat: any) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2.5"
                >
                  <span className="text-sm font-medium text-slate-800">{cat.name}</span>
                  {canManageCategory && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEditCat(cat)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-100"
                      >
                        <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                      </button>
                      <button
                        onClick={() => handleDeleteCat(cat.id, cat.name)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {categories.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-400">\u6682\u65e0\u5206\u7c7b</div>
        )}
      </CollapseCard>

      {/* shareholder modal */}
      <Modal
        open={showShareholderModal}
        onClose={() => setShowShareholderModal(false)}
        title={editShareholderIdx !== null ? '\u7f16\u8f91\u80a1\u4e1c' : '\u6dfb\u52a0\u80a1\u4e1c'}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">
              {'\u80a1\u4e1c\u59d3\u540d'} <span className="text-rose-400">{'*'}</span>
            </label>
            <input
              value={shareholderForm.name}
              onChange={(e) => setShareholderForm({ ...shareholderForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder={'\u8bf7\u8f93\u5165\u59d3\u540d'}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{'\u7535\u8bdd'}</label>
            <input
              value={shareholderForm.phone}
              onChange={(e) => setShareholderForm({ ...shareholderForm, phone: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder={'\u8bf7\u8f93\u5165\u7535\u8bdd\u53f7\u7801'}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{'\u6301\u80a1\u6bd4\u4f8b (%)'}</label>
            <input
              type="number"
              min="0"
              max="100"
              value={shareholderForm.ratio}
              onChange={(e) =>
                setShareholderForm({ ...shareholderForm, ratio: Number(e.target.value) || 0 })
              }
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder="0-100"
            />
          </div>
          <button
            onClick={handleSaveShareholder}
            disabled={savingShareholder}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingShareholder ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'}
          </button>
        </div>
      </Modal>

      {/* category modal */}
      <Modal
        open={showCatModal}
        onClose={() => setShowCatModal(false)}
        title={editCat ? '\u7f16\u8f91\u5206\u7c7b' : '\u6dfb\u52a0\u5206\u7c7b'}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">{'\u5206\u7c7b\u540d\u79f0'}</label>
            <input
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              placeholder={'\u5206\u7c7b\u540d\u79f0'}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{'\u7c7b\u578b'}</label>
            <div className="flex gap-2">
              <button
                onClick={() => setCatForm({ ...catForm, type: 'income' })}
                className={
                  'flex-1 rounded-xl py-2 text-sm ' +
                  (catForm.type === 'income'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600')
                }
              >
                {'\u6536\u5165'}
              </button>
              <button
                onClick={() => setCatForm({ ...catForm, type: 'expense' })}
                className={
                  'flex-1 rounded-xl py-2 text-sm ' +
                  (catForm.type === 'expense'
                    ? 'bg-rose-500 text-white'
                    : 'bg-slate-100 text-slate-600')
                }
              >
                {'\u652f\u51fa'}
              </button>
            </div>
          </div>
          <button
            onClick={handleSaveCat}
            disabled={savingCat}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {savingCat ? '\u4fdd\u5b58\u4e2d...' : '\u4fdd\u5b58'}
          </button>
        </div>
      </Modal>
    </div>
  );
}