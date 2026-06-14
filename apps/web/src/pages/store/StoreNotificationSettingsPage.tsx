import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Send, Check, Edit2, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

const channels = [
  { key: 'pushplus', label: 'PushPlus', fields: [{ f: 'pushplus_token', label: 'Token', secret: true }] },
  { key: 'serverchan', label: 'Server酱', fields: [{ f: 'serverchan_key', label: 'Key', secret: true }] },
  { key: 'wecom', label: '企业微信自建应用', fields: [
    { f: 'wecom_corpid', label: 'CorpID', secret: false },
    { f: 'wecom_agentid', label: 'AgentID', secret: false },
    { f: 'wecom_secret', label: 'Secret', secret: true },
    { f: 'wecom_userid', label: 'UserID', secret: false },
    { f: 'wecom_proxy_url', label: '代理URL', secret: false },
  ] },
];

const pushOptions = [
  { key: 'push_daily_report', label: '每日简报' },
  { key: 'push_weekly_report', label: '每周简报' },
  { key: 'push_monthly_report', label: '每月简报' },
  { key: 'push_review_reminder', label: '审核提醒' },
  { key: 'push_alert', label: '异常警告' },
];

const inputCls = 'w-full rounded-xl border border-white/40 bg-white/50 px-4 py-2.5 text-sm backdrop-blur-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 transition-all';

export default function StoreNotificationSettingsPage() {
  const { storeId } = useParams();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [channelStatus, setChannelStatus] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<{ok: boolean; text: string} | null>(null);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ok: boolean; text: string} | null>(null);

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => {
    api.get('/stores/' + storeId + '/notification-settings').then((d) => {
      setSettings(d);
      const status: Record<string, boolean> = {};
      channels.forEach((ch: any) => {
        const hasConfig = ch.fields.every((f: any) => (d as any)[f.f]);
        status[ch.key] = hasConfig;
      });
      setChannelStatus(status);
    }).catch(() => {});
  }, []);

  const handleToggle = async (key: string) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    try { await api.put('/stores/' + storeId + '/notification-settings', updated); } catch {}
  };

  const openEditChannel = (ch: any) => {
    setEditingChannel(ch.key);
    setChannelForm(ch.fields.reduce((a: any, f: any) => ({ ...a, [f.f]: settings[f.f] || '' }), {}));
    setShowSecret({});
    setTestResult(null);
  };

  const handleSave = async () => {
    try {
      const updated = { ...settings, ...channelForm };
      await api.put('/stores/' + storeId + '/notification-settings', updated);
      setSettings(updated);
      const ch = channels.find(c => c.key === editingChannel);
      const hasConfig = ch?.fields.every((f: any) => (channelForm as any)[f.f]) ?? false;
      setChannelStatus(s => ({ ...s, [editingChannel!]: hasConfig }));
      setEditingChannel(null);
      showMsg(true, '配置已保存');
    } catch (e: any) { showMsg(false, e.message || '保存失败'); }
  };

  const handleTest = async () => {
    const ch = channels.find(c => c.key === editingChannel);
    const hasConfig = ch?.fields.every((f: any) => (channelForm as any)[f.f]) ?? false;
    if (!hasConfig) {
      setTestResult({ ok: false, text: '请先填写所有必填配置项' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const updated = { ...settings, ...channelForm, method: editingChannel };
    try {
      await api.put('/stores/' + storeId + '/notification-settings', updated);
      await api.post('/stores/' + storeId + '/notification-settings/test?type=daily', {});
      setChannelStatus(s => ({ ...s, [editingChannel!]: true }));
      setTestResult({ ok: true, text: '测试成功，推送已发送' });
    } catch (e: any) {
      setTestResult({ ok: false, text: e.message || '测试失败，请检查配置' });
    } finally {
      const restored = { ...updated, method: 'none' };
      await api.put('/stores/' + storeId + '/notification-settings', restored).catch(() => {});
      setSettings(restored);
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="消息推送" subtitle="配置店铺消息推送渠道和内容" />

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm backdrop-blur-sm ${msg.ok ? 'bg-emerald-100/80 text-emerald-700' : 'bg-red-100/80 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <GlassCard>
        <h3 className="mb-4 text-sm font-semibold text-slate-700">渠道配置</h3>
        <div className="space-y-3">
          {channels.map(ch => {
            const configured = (channelStatus as Record<string, boolean>)[ch.key];
            return (
              <div key={ch.key} className={`flex items-center justify-between rounded-xl p-3 transition-all ${configured ? 'bg-emerald-50/80 border border-emerald-200' : 'bg-white/40'}`}>
                <div className="flex items-center gap-3">
                  <div className={`h-2.5 w-2.5 rounded-full ${configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <div>
                    <div className="text-sm font-medium text-slate-700">{ch.label}</div>
                    <div className="text-xs text-slate-400">{configured ? '已配置' : '未配置'}</div>
                  </div>
                </div>
                <button onClick={() => openEditChannel(ch)} className="rounded-lg bg-white/60 p-2 text-slate-500 hover:bg-white/80"><Edit2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">配置了多个渠道时，消息将同时推送到所有已配置的渠道。</p>
      </GlassCard>

      <GlassCard>
        <h3 className="mb-4 text-sm font-semibold text-slate-700">推送内容</h3>
        <div className="space-y-2">
          {pushOptions.map(opt => (
            <label key={opt.key} className="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 p-3 hover:bg-white/60 transition-all">
              <span className="text-sm text-slate-700">{opt.label}</span>
              <div className={`relative h-6 w-11 rounded-full transition-colors ${(settings as Record<string, any>)[opt.key] ? 'bg-indigo-500' : 'bg-slate-300'}`} onClick={() => handleToggle(opt.key)}>
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${(settings as Record<string, any>)[opt.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </label>
          ))}
        </div>
      </GlassCard>

      <Modal open={!!editingChannel} onClose={() => setEditingChannel(null)} title={'配置 ' + (channels.find(c => c.key === editingChannel)?.label || '')}>
        <div className="space-y-4">
          {editingChannel && channels.find(c => c.key === editingChannel)?.fields.map((f) => (
            <div key={f.f}>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">{f.label}</label>
              <div className="relative">
                <input type={f.secret && !(showSecret as any)[f.f] ? 'password' : 'text'} value={(channelForm as any)[f.f] || ''} onChange={e => setChannelForm((s) => ({ ...s, [f.f]: e.target.value }))} className={inputCls} placeholder={'请输入 ' + f.label} />
                {f.secret && <button onClick={() => setShowSecret(s => ({ ...s, [f.f]: !s[f.f] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{(showSecret as any)[f.f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
              </div>
            </div>
          ))}

          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {(testResult as any).ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {(testResult as any).text}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">保存</button>
            <button onClick={handleTest} disabled={testing} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              {testing ? <><Loader2 className="h-4 w-4 animate-spin" />测试中...</> : <><Send className="h-4 w-4" />测试</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
