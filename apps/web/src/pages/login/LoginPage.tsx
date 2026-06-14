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
      if (user?.store_id && user.role !== 'ADMIN') {
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
          <img src="data:image/png;base64,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" alt="Logo" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover login-logo" />
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
    </div>
  );
}