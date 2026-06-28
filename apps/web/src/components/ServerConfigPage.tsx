import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setServerURL, getServerURL, clearServerURL } from '../lib/config';
import { showToast } from './Toast';
import { GlassCard } from './GlassCard';
import { Globe, Wifi, WifiOff, Check, ArrowRight, Settings } from 'lucide-react';

export default function ServerConfigPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState(getServerURL() || 'https://');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [isEdit, setIsEdit] = useState(!!getServerURL());

  const testConnection = async () => {
    if (!url || url === 'https://') {
      showToast('请输入服务器地址', 'error');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const normalized = url.replace(/\/+$/, '');
      const res = await fetch(normalized + '/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        setTestResult('ok');
        showToast('连接成功', 'success');
      } else {
        setTestResult('fail');
        showToast('服务器响应异常: ' + res.status, 'error');
      }
    } catch (e: any) {
      setTestResult('fail');
      showToast('连接失败: ' + (e.message || '网络错误'), 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!url || url === 'https://') {
      showToast('请输入服务器地址', 'error');
      return;
    }
    const normalized = url.replace(/\/+$/, '');
    setServerURL(normalized);
    showToast('服务器地址已保存', 'success');
    navigate('/login');
  };

  const handleClear = () => {
    clearServerURL();
    setUrl('https://');
    setTestResult(null);
    setIsEdit(false);
    showToast('已清除服务器地址', 'success');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#fcd5e5] to-[#7977de] shadow-xl">
            <img src="/logo.png" alt="Logo" className="h-12 w-12 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Multi Shop Link</h1>
          <p className="mt-2 text-sm text-slate-500">
            {isEdit ? '更改服务器连接' : '首次使用，请配置服务器地址'}
          </p>
        </div>

        <GlassCard className="p-6 space-y-5">
          {/* URL Input */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              服务器地址
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setTestResult(null); }}
                placeholder="https://msl.example.com"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                autoComplete="url"
                autoCapitalize="none"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              输入你的 Multi Shop Link 服务器地址，包含 https://
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
              testResult === 'ok' 
                ? 'bg-emerald-50 text-emerald-700' 
                : 'bg-rose-50 text-rose-700'
            }`}>
              {testResult === 'ok' 
                ? <><Wifi className="h-4 w-4" /> 连接成功，服务器正常</> 
                : <><WifiOff className="h-4 w-4" /> 连接失败，请检查地址</>}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={testConnection}
              disabled={testing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? (
                <><div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" /> 测试中...</>
              ) : (
                <><Wifi className="h-4 w-4" /> 测试连接</>
              )}
            </button>
            <button
              onClick={handleSave}
              disabled={testing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-medium text-white shadow-lg transition-all hover:bg-indigo-600 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> {isEdit ? '保存' : '连接'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Clear button (only when editing) */}
          {isEdit && (
            <button
              onClick={handleClear}
              className="w-full text-center text-xs text-slate-400 hover:text-rose-500 transition-colors"
            >
              清除服务器地址，重新配置
            </button>
          )}
        </GlassCard>

        {/* Settings link */}
        <div className="text-center">
          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-500 transition-colors"
          >
            <Settings className="h-3 w-3" /> 跳过，直接登录
          </button>
        </div>
      </div>
    </div>
  );
}
