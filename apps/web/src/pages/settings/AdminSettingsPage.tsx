import { useState, useRef } from 'react';
import { useStore } from '../../stores/data';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { User, Phone, MapPin, Shield, Camera, Upload, Lock, Save } from 'lucide-react';

const roleLabels: Record<string, string> = { ADMIN: '管理员', MANAGER: '店长', STAFF: '员工', SHAREHOLDER: '股东' };

export default function AdminSettingsPage() {
  const user = useStore((s) => s.user);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [pwdForm, setPwdForm] = useState({ oldPassword: '', newPassword: '', confirm: '' });
  const [profileForm, setProfileForm] = useState({ phone: user?.phone || '', address: (user as any)?.address || '' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 3000); };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const d: any = await api.put('/auth/me', profileForm);
      if (d.user) {
        useStore.setState({ user: { ...user!, ...d.user } });
      }
      showMsg(true, d.message || '信息已更新');
      setShowProfile(false);
    } catch (e: any) { showMsg(false, e.message || '更新失败'); }
    finally { setSaving(false); }
  };

  const handleChangePwd = async () => {
    if (!pwdForm.oldPassword || !pwdForm.newPassword) { showMsg(false, '请填写完整'); return; }
    if (pwdForm.newPassword !== pwdForm.confirm) { showMsg(false, '两次密码不一致'); return; }
    setSaving(true);
    try {
      const d: any = await api.put('/auth/me', { oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
      showMsg(true, d.message || '密码修改成功');
      setShowPwd(false);
      setPwdForm({ oldPassword: '', newPassword: '', confirm: '' });
    } catch (e: any) { showMsg(false, e.message || '修改失败'); }
    finally { setSaving(false); }
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d: any = await api.put('/auth/me', { avatar: reader.result });
        if (d.user) useStore.setState({ user: { ...user!, ...d.user } });
        showMsg(true, '头像已更新');
      } catch { showMsg(false, '头像更新失败'); }
    };
    reader.readAsDataURL(file);
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

  return (
    <div className="space-y-4">
      <PageHeader title="账户信息" subtitle="管理您的个人资料" />

      {msg && <div className={'rounded-xl p-3 text-sm ' + (msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>{msg.text}</div>}

      {/* Avatar + Name card */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 overflow-hidden">
              {user?.avatar ? <img src={user.avatar} className="h-full w-full object-cover" /> : (user?.name?.[0] || '?')}
            </div>
            <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
              <button onClick={() => fileRef.current?.click()} className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg hover:bg-indigo-600" title="上传">
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => cameraRef.current?.click()} className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg hover:bg-indigo-600" title="拍照">
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleAvatar} className="hidden" />
          </div>
          <div>
            <div className="text-xl font-bold text-slate-900">{user?.name}</div>
            <div className="text-sm text-slate-500">@{user?.username}</div>
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">{roleLabels[user?.role || ''] || user?.role}</span>
          </div>
        </div>
      </GlassCard>

      {/* Info list */}
      <GlassCard className="divide-y divide-slate-100">
        {[
          { icon: User, label: '用户名', value: user?.username },
          { icon: Phone, label: '手机号', value: (user as any)?.phone || '未设置' },
          { icon: MapPin, label: '联系地址', value: (user as any)?.address || '未设置' },
          { icon: Shield, label: '角色', value: roleLabels[user?.role || ''] || user?.role },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 px-4 py-3.5">
            <item.icon className="h-4 w-4 text-slate-400" />
            <div className="flex-1 text-sm text-slate-500">{item.label}</div>
            <div className="text-sm font-medium text-slate-800">{item.value}</div>
          </div>
        ))}
      </GlassCard>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => { setProfileForm({ phone: (user as any)?.phone || '', address: (user as any)?.address || '' }); setShowProfile(true); }}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all">
          <User className="h-4 w-4" />编辑资料
        </button>
        <button onClick={() => setShowPwd(true)}
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/80 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-all">
          <Lock className="h-4 w-4" />修改密码
        </button>
      </div>

      {/* Edit profile modal */}
      <Modal open={showProfile} onClose={() => setShowProfile(false)} title="编辑资料">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">手机号</label>
            <input value={profileForm.phone} onChange={e => setProfileForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} placeholder="请输入手机号" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">联系地址</label>
            <input value={profileForm.address} onChange={e => setProfileForm(f => ({ ...f, address: e.target.value }))} className={inputCls} placeholder="请输入联系地址" />
          </div>
          <button onClick={handleSaveProfile} disabled={saving} className="btn w-full disabled:opacity-50"><Save className="mr-1.5 h-4 w-4 inline" />{saving ? '保存中..' : '保存'}</button>
        </div>
      </Modal>

      {/* Change password modal */}
      <Modal open={showPwd} onClose={() => setShowPwd(false)} title="修改密码">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">当前密码</label>
            <input type="password" value={pwdForm.oldPassword} onChange={e => setPwdForm(f => ({ ...f, oldPassword: e.target.value }))} className={inputCls} placeholder="请输入当前密码" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">新密码</label>
            <input type="password" value={pwdForm.newPassword} onChange={e => setPwdForm(f => ({ ...f, newPassword: e.target.value }))} className={inputCls} placeholder="请输入新密码" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">确认密码</label>
            <input type="password" value={pwdForm.confirm} onChange={e => setPwdForm(f => ({ ...f, confirm: e.target.value }))} className={inputCls} placeholder="请再次输入新密码" />
          </div>
          <button onClick={handleChangePwd} disabled={saving} className="btn w-full disabled:opacity-50"><Lock className="mr-1.5 h-4 w-4 inline" />{saving ? '保存中..' : '确认修改'}</button>
        </div>
      </Modal>
    </div>
  );
}