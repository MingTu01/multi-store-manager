import { getRoleLabel } from '../../lib/role';
import { useState } from 'react';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../stores/data';
import { Key, CheckCircle, AlertCircle, Settings, LogOut, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PasswordPage() {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const nav = useNavigate();
  const [form, setForm] = useState({ old: '', pwd: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSubmit = async () => {
    setMsg(null);
    if (!form.old || !form.pwd) { setMsg({ ok: false, text: '请填写完整' }); return; }
    if (form.pwd !== form.confirm) { setMsg({ ok: false, text: '两次密码不一致' }); return; }
    if (form.pwd.length < 6) { setMsg({ ok: false, text: '新密码至少6位' }); return; }
    setSaving(true);
    try {
      const d = await api.put('/auth/password', { oldPassword: form.old, newPassword: form.pwd });
      setMsg({ ok: true, text: d.message || '密码修改成功' });
      setForm({ old: '', pwd: '', confirm: '' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message || '修改失败' });
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="账户信息" />

      <GlassCard className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-base font-bold text-indigo-600">
            {user?.name?.[0] || '?'}
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">{user?.name}</div>
            <div className="text-sm text-slate-500">{getRoleLabel(user?.role)}</div>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <button onClick={() => setMsg(null)} className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Key className="h-4 w-4 text-indigo-500" />修改密码
          </div>
        </button>
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label className="mb-1 block text-xs text-slate-500">旧密码</label>
            <input type="password" value={form.old} onChange={(e) => setForm({ ...form, old: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">新密码</label>
            <input type="password" value={form.pwd} onChange={(e) => setForm({ ...form, pwd: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">确认新密码</label>
            <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} className="input" />
          </div>
          <button onClick={handleSubmit} disabled={saving} className="btn w-full py-2.5 text-sm disabled:opacity-50">
            {saving ? '提交中...' : '确认修改'}
          </button>
          {msg && (
            <div className={'flex items-center gap-2 rounded-xl p-2.5 text-sm ' + (msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700')}>
              {msg.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}{msg.text}
            </div>
          )}
        </div>
      </GlassCard>

      {user?.role === 'ADMIN' && (
        <GlassCard className="cursor-pointer p-4 transition-all hover:shadow-lg" onClick={() => nav('/upgrade')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Settings className="h-4 w-4 text-indigo-500" />系统设置
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">服务器信息、数据库备份、系统升级</p>
        </GlassCard>
      )}

      <GlassCard className="p-4">
        <button onClick={logout} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50">
          <LogOut className="h-4 w-4" />退出登录
        </button>
      </GlassCard>
    </div>
  );
}
