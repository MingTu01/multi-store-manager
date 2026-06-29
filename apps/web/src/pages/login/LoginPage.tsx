import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../stores/data';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { LogIn, AlertCircle, Settings, Lock } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [mustChangePwd, setMustChangePwd] = useState(false);
  const [newPwd, setNewPwd] = useState({ new: '', confirm: '' });
  const [pwdLoading, setPwdLoading] = useState(false);
  const login = useStore((s) => s.login);
  const nav = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!username || !password) { setErr('请输入用户名和密码'); return; }
    setLoading(true);
    try {
      await login(username, password);
      const user = useStore.getState().user;
      if (user?.must_change_password) {
        setMustChangePwd(true);
        return; // 不跳转，等改密
      }
      // 正常跳转
      if (user?.store_id && user?.role !== 'ADMIN') {
        nav('/store/' + user.store_id, { replace: true });
      } else {
        nav('/', { replace: true });
      }
    } catch (e: any) {
      setErr(e.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePwd = async () => {
    setErr('');
    if (newPwd.new.length < 6) { setErr('密码至少6位'); return; }
    if (!/[a-zA-Z]/.test(newPwd.new) || !/\d/.test(newPwd.new)) { setErr('密码必须包含字母和数字'); return; }
    if (newPwd.new !== newPwd.confirm) { setErr('两次密码不一致'); return; }
    setPwdLoading(true);
    try {
      await api.put('/auth/me', { oldPassword: password, newPassword: newPwd.new });
      setMustChangePwd(false);
      // 更新 user 状态
      useStore.setState({ user: { ...useStore.getState().user!, must_change_password: 0 } });
      // 正常跳转
      const u = useStore.getState().user;
      if (u?.store_id && u?.role !== 'ADMIN') {
        nav('/store/' + u.store_id, { replace: true });
      } else {
        nav('/', { replace: true });
      }
    } catch (e: any) {
      setErr(e.message || '修改密码失败');
    } finally {
      setPwdLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
      <GlassCard className="w-full max-w-sm p-8 login-card">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="Logo" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover login-logo" />
          <h1 className="inline-block rounded-full bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-1.5 text-xl font-bold text-white animate-gradient-capsule"><span className="animate-text-gradient">Multi Shop Link</span></h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="请输入用户名" autoComplete="username" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="请输入密码" autoComplete="current-password" />
          </div>
          {err && !mustChangePwd && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
              <AlertCircle className="h-4 w-4 shrink-0" />{err}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
            <LogIn className="h-4 w-4" />{loading ? '登录中..' : '登录'}
          </button>
          <p className="mt-3 text-center text-sm text-slate-400">请登录以继续</p>
        </form>
        <button type="button" onClick={() => window.location.href = '/server-config'} className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-400 shadow-sm hover:text-indigo-500 hover:bg-white transition-all">
          <Settings className="h-4 w-4" />
        </button>
      </GlassCard>

      {mustChangePwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white/95 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">首次登录，请修改密码</h2>
                <p className="text-xs text-slate-500">为了账号安全，请修改初始密码</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">新密码</label>
                <input type="password" value={newPwd.new} onChange={(e) => setNewPwd({ ...newPwd, new: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="至少6位，含字母和数字" autoComplete="new-password" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">确认新密码</label>
                <input type="password" value={newPwd.confirm} onChange={(e) => setNewPwd({ ...newPwd, confirm: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" placeholder="请再次输入新密码" autoComplete="new-password" />
              </div>
              {err && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                  <AlertCircle className="h-4 w-4 shrink-0" />{err}
                </div>
              )}
              <button onClick={handleChangePwd} disabled={pwdLoading} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
                <Lock className="h-4 w-4" />{pwdLoading ? '提交中..' : '确认修改并登录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
