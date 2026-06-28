import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../stores/data';
import { GlassCard } from '../../components/GlassCard';
import { LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
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
          {err && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
              <AlertCircle className="h-4 w-4 shrink-0" />{err}
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2">
            <LogIn className="h-4 w-4" />{loading ? '登录中..' : '登录'}
          </button>
          <p className="mt-3 text-center text-sm text-slate-400">请登录以继续</p>
        </form>
      </GlassCard>
        <div className="mt-4 text-center">
          <button type="button" onClick={() => window.location.href = '/server-config'} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors">更改服务器地址</button>
        </div>
    </div>
  );
}