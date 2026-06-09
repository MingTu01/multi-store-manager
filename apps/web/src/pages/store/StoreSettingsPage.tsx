import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { useStore } from '../../stores/data';
import { Save, MapPin, Building2, DollarSign, Users, Key, LogOut, Loader2, Plus, Edit3, Trash2, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function StoreSettingsPage() {
  const { storeId } = useParams();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const [store, setStore] = useState<any>(null);
  const [form, setForm] = useState({ name: '', address: '', initial_capital: '' });
  const [shareholders, setShareholders] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [showShModal, setShowShModal] = useState(false);
  const [editSh, setEditSh] = useState<any>(null);
  const [shForm, setShForm] = useState({ name: '', phone: '', ratio: '' });
  const [savingSh, setSavingSh] = useState(false);
  const [pwForm, setPwForm] = useState({ old: '', pwd: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPw, setShowPw] = useState(false);

  const load = () => {
    if (!storeId) return;
    api.get('/stores/' + storeId).then((d) => {
      const s = d.store || d;
      setStore(s);
      setForm({ name: s.name || '', address: s.address || '', initial_capital: String(s.initial_capital || '') });
    }).catch(() => {});
    api.get('/stores/' + storeId + '/shareholders').then((d) => setShareholders(Array.isArray(d) ? d : (d.shareholders || []))).catch(() => {});
  };
  useEffect(() => { load(); }, [storeId]);

  const handleSaveStore = async () => {
    setSaving(true);
    try {
      await api.put('/stores/' + storeId, {
        name: form.name,
        address: form.address,
        initial_capital: parseFloat(form.initial_capital) || 0,
      });
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSaving(false); }
  };

  const openCreateSh = () => { setEditSh(null); setShForm({ name: '', phone: '', ratio: '' }); setShowShModal(true); };
  const openEditSh = (sh: any) => { setEditSh(sh); setShForm({ name: sh.name || '', phone: sh.phone || '', ratio: String((sh.ratio || 0) * 100) }); setShowShModal(true); };

  const handleSaveSh = async () => {
    if (!shForm.name) return;
    setSavingSh(true);
    try {
      const body = { name: shForm.name, phone: shForm.phone, ratio: parseFloat(shForm.ratio) / 100 || 0 };
      if (editSh) {
        await api.put('/stores/' + storeId + '/shareholders/' + editSh.id, body);
      } else {
        await api.post('/stores/' + storeId + '/shareholders', body);
      }
      setShowShModal(false);
      load();
    } catch (e: any) { alert(e.message || '保存失败'); }
    finally { setSavingSh(false); }
  };

  const handleDeleteSh = async (id: number, name: string) => {
    if (!confirm('确认删除股东 ' + name + ' ？')) return;
    try { await api.del('/stores/' + storeId + '/shareholders/' + id); load(); } catch (e: any) { alert(e.message || '删除失败'); }
  };

  const handlePwChange = async () => {
    setPwMsg(null);
    if (!pwForm.old || !pwForm.pwd) { setPwMsg({ ok: false, text: '请填写完整' }); return; }
    if (pwForm.pwd !== pwForm.confirm) { setPwMsg({ ok: false, text: '两次密码不一致' }); return; }
    if (pwForm.pwd.length < 6) { setPwMsg({ ok: false, text: '新密码至少6位' }); return; }
    setPwSaving(true);
    try {
      const d = await api.put('/auth/password', { oldPassword: pwForm.old, newPassword: pwForm.pwd });
      setPwMsg({ ok: true, text: d.message || '密码修改成功' });
      setPwForm({ old: '', pwd: '', confirm: '' });
    } catch (e: any) { setPwMsg({ ok: false, text: e.message || '修改失败' }); }
    finally { setPwSaving(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title={"门店设置"} subtitle={store?.name || ''} />

      {/* Store basic info */}
      <GlassCard className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Building2 className="h-4 w-4 text-indigo-500" />{"基本信息"}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"门店名称"}</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"地址"}</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="input pl-9" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"初始资金"}</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="number" value={form.initial_capital} onChange={(e) => setForm({ ...form, initial_capital: e.target.value })} className="input pl-9" />
            </div>
          </div>
          <button onClick={handleSaveStore} disabled={saving} className="btn w-full disabled:opacity-50">
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}{saving ? '保存中..' : '保存设置'}
          </button>
        </div>
      </GlassCard>

      {/* Shareholders */}
      <GlassCard className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Users className="h-4 w-4 text-indigo-500" />{"股东信息"}</h3>
          <button onClick={openCreateSh} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50"><Plus className="h-3.5 w-3.5" />{"添加"}</button>
        </div>
        {shareholders.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">{"暂无股东信息"}</div>
        ) : (
          <div className="space-y-2">
            {shareholders.map((sh: any) => (
              <div key={sh.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-600">{sh.name?.[0] || '?'}</div>
                  <div>
                    <div className="text-sm font-medium text-slate-800">{sh.name}</div>
                    <div className="text-xs text-slate-400">{sh.phone || '--'} · {((sh.ratio || 0) * 100).toFixed(0)}%</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditSh(sh)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-200"><Edit3 className="h-3.5 w-3.5 text-slate-500" /></button>
                  <button onClick={() => handleDeleteSh(sh.id, sh.name)} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5 text-rose-500" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Mobile: Account info, change password, logout */}
      <div className="lg:hidden">
        <GlassCard className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-base font-bold text-indigo-600">
              {user?.name?.[0] || '?'}
            </div>
            <div>
              <div className="text-base font-bold text-slate-900">{user?.name}</div>
              <div className="text-sm text-slate-500">{user?.role === 'ADMIN' ? '管理员' : user?.role === 'MANAGER' ? '经理' : user?.role === 'STAFF' ? '员工' : '股东'}</div>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="mt-3 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Key className="h-4 w-4 text-indigo-500" />{"修改密码"}</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500">{"旧密码"}</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={pwForm.old} onChange={(e) => setPwForm({ ...pwForm, old: e.target.value })} className="input pr-9" />
                <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2">{showPw ? <EyeOff className="h-4 w-4 text-slate-400" /> : <Eye className="h-4 w-4 text-slate-400" />}</button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{"新密码"}</label>
              <input type={showPw ? 'text' : 'password'} value={pwForm.pwd} onChange={(e) => setPwForm({ ...pwForm, pwd: e.target.value })} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">{"确认新密码"}</label>
              <input type={showPw ? 'text' : 'password'} value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} className="input" />
            </div>
            <button onClick={handlePwChange} disabled={pwSaving} className="btn w-full py-2.5 text-sm disabled:opacity-50">
              {pwSaving ? '提交中..' : '确认修改'}
            </button>
            {pwMsg && (
              <div className={'flex items-center gap-2 rounded-xl p-2.5 text-sm ' + (pwMsg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
                {pwMsg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{pwMsg.text}
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard className="mt-3 p-4">
          <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50">
            <LogOut className="h-4 w-4" />{"退出登录"}
          </button>
        </GlassCard>
      </div>

      {/* Shareholder Modal */}
      <Modal open={showShModal} onClose={() => setShowShModal(false)} title={editSh ? '编辑股东' : '添加股东'}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"姓名"}</label>
            <input value={shForm.name} onChange={(e) => setShForm({ ...shForm, name: e.target.value })} className="input" placeholder="股东姓名" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"手机号"} ({"可选"})</label>
            <input value={shForm.phone} onChange={(e) => setShForm({ ...shForm, phone: e.target.value })} className="input" placeholder="手机号码" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">{"股比"} (%)</label>
            <input type="number" value={shForm.ratio} onChange={(e) => setShForm({ ...shForm, ratio: e.target.value })} className="input" placeholder="0" min="0" max="100" />
          </div>
          <button onClick={handleSaveSh} disabled={savingSh} className="btn w-full disabled:opacity-50">{savingSh ? '保存中..' : '保存'}</button>
        </div>
      </Modal>
    </div>
  );
}
