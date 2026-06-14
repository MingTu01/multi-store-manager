import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Server, Database, Upload, Send, Info, Save, HardDrive, Cpu, RefreshCw, Download, Trash2, RotateCcw, Plus, Edit2, Check, X, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

type Tab = 'info' | 'backup' | 'upgrade' | 'notif' | 'perms';
const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'info', label: '系统信息', icon: Server },
  { key: 'backup', label: '数据备份', icon: Database },
  { key: 'upgrade', label: '系统升级', icon: Upload },
  { key: 'notif', label: '消息推送', icon: Send },
  { key: 'perms', label: '权限说明', icon: Info },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('info');
  const [info, setInfo] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [autoBackup, setAutoBackup] = useState<any>({});
  const [uploadingBackup, setUploadingBackup] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoreFilename, setRestoreFilename] = useState('');
  const [restoreSteps, setRestoreSteps] = useState<{ msg: string; done: boolean }[]>([]);
  const [restoreComplete, setRestoreComplete] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const backupFileRef = useRef<HTMLInputElement>(null);
  const [notifSettings, setNotifSettings] = useState<any>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState<any>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});

  const [channelStatus, setChannelStatus] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  // Upgrade states
  const [upgradeFile, setUpgradeFile] = useState<File | null>(null);
  const [upgradeInfo, setUpgradeInfo] = useState<any>(null);
  const [validating, setValidating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [upgradeSteps, setUpgradeSteps] = useState<{ msg: string; done: boolean }[]>([]);
  const [upgradeComplete, setUpgradeComplete] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showMsg = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  useEffect(() => {
    if (tab === 'info') api.get('/system/info').then(setInfo).catch(() => {});
    if (tab === 'backup') {
      api.get('/system/auto-backup').then(setAutoBackup).catch(() => {});
      api.get('/system/backups').then((d: any) => setBackups(d.backups || [])).catch(() => {});
    }
      if (tab === 'notif') api.get('/system/notification-settings').then((d: any) => {
        setNotifSettings(d);
        const status: Record<string, boolean> = {};
        channels.forEach(ch => { status[ch.key] = ch.fields.every(f => d[f.f]); });
        setChannelStatus(status);
      }).catch(() => {});
  }, [tab]);

  // === Backup ===
  const handleBackup = async () => {
    try { const d: any = await api.post('/system/backup', {}); showMsg(true, d.message || '备份成功'); api.get('/system/backups').then((d: any) => setBackups(d.backups || [])); }
    catch (e: any) { showMsg(false, e.message || '备份失败'); }
  };
  
  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) { showMsg(false, '请上传.zip格式的备份文件'); return; }
    setUploadingBackup(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/system/backups/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: fd
      });
      const d = await r.json();
      if (r.ok) {
        showMsg(true, d.message || '上传成功');
        api.get('/system/backups').then((d: any) => setBackups(d.backups || []));
      } else {
        showMsg(false, d.error || '上传失败');
      }
    } catch (err: any) { showMsg(false, err.message || '上传失败'); }
    finally { setUploadingBackup(false); if (backupFileRef.current) backupFileRef.current.value = ''; }
  };
  
  const handleRestore = (filename: string) => {
    setRestoreFilename(filename);
    setShowRestoreModal(true);
    setRestoreComplete(false);
    setRestoreSteps([]);
    setRestoring(false);
  };
  
  const confirmRestore = async (filename?: string) => {
    const file = filename || restoreFilename;
    setRestoring(true);
    setRestoreSteps([{ msg: '正在备份当前数据库...', done: false }]);
    
    try {
      // Step 1: Backup current DB
      await api.post('/system/backup', {});
      setRestoreSteps([{ msg: '当前数据库已备份', done: true }, { msg: '正在恢复备份数据...', done: false }]);
      
      // Step 2: Restore (this will trigger server restart)
      await api.post('/system/backups/' + file + '/restore', {});
      setRestoreSteps(prev => [...prev.slice(0, 1), { msg: '当前数据库已备份', done: true }, { msg: '备份数据已恢复', done: true }, { msg: '服务器正在重启...', done: false }]);
      
      // Step 3: Poll for server restart
      const pollServer = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const r = await fetch('/api/system/info');
            if (r.ok) {
              setRestoreSteps(prev => {
                const newSteps = [...prev];
                newSteps[newSteps.length - 1] = { msg: '服务器已重启', done: true };
                return newSteps;
              });
              setRestoreComplete(true);
              setRestoring(false);
              return;
            }
          } catch {}
        }
        setRestoreComplete(true);
        setRestoring(false);
      };
      pollServer();
    } catch (e: any) {
      setRestoreSteps(prev => [...prev, { msg: '恢复失败: ' + (e.message || '未知错误'), done: false }]);
      showMsg(false, e.message || '恢复失败');
      setRestoring(false);
    }
  };
  
  const handleRefreshAfterRestore = () => {
    setShowRestoreModal(false);
    window.location.reload();
  };
  
  const handleDeleteBackup = async (filename: string) => {
    if (!confirm('确定删除此备份？')) return;
    try { await api.del('/system/backups/' + filename); showMsg(true, '备份已删除'); setBackups(b => b.filter(x => x.filename !== filename)); }
    catch (e: any) { showMsg(false, e.message || '删除失败'); }
  };
  const handleDownload = async (filename: string) => { try { const r = await fetch('/api/system/backups/' + filename + '/download', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } }); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); } catch (e) { alert('下载失败'); } };
  
  // Get backup type label
  const getBackupType = (filename: string) => {
    if (filename.startsWith('manual-')) return { label: '手动', color: 'bg-blue-100 text-blue-700' };
    if (filename.startsWith('auto-')) return { label: '自动', color: 'bg-emerald-100 text-emerald-700' };
    if (filename.startsWith('pre-upgrade-')) return { label: '升级前', color: 'bg-amber-100 text-amber-700' };
    if (filename.startsWith('uploaded-')) return { label: '上传', color: 'bg-purple-100 text-purple-700' };
    return { label: '备份', color: 'bg-slate-100 text-slate-700' };
  };

  // === Upgrade ===
  const handleUpgradeSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.zip')) { showMsg(false, '请上传ZIP格式的升级包'); return; }
    setUpgradeFile(file);
    setUpgradeInfo(null);
    setValidating(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r: any = await fetch('/api/system/upgrade/validate', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: fd }).then(r => {
        if (!r.ok) throw new Error('验证失败');
        return r.json();
      });
      if (r.valid) {
        setUpgradeInfo(r);
      } else {
        showMsg(false, r.error || '升级包无效');
      }
    } catch (err: any) { showMsg(false, err.message || '验证失败'); }
    finally { setValidating(false); }
  };

  const handleStartUpgrade = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmUpgrade = async () => {
    setShowConfirmModal(false);
    setShowProgressModal(true);
    setUpgrading(true);
    setUpgradeComplete(false);
    setUpgradeSteps([]);
    const totalSteps = 5;
    const stepNames = ['备份数据库', '解压升级包', '更新版本信息', '覆盖系统文件', '完成'];
    // Initialize steps
    setUpgradeSteps(stepNames.map(n => ({ msg: '', done: false })));
    // Start upgrade
    const fd = new FormData();
    fd.append('file', upgradeFile!);
    try {
      await fetch('/api/system/upgrade', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: fd });
    } catch { showMsg(false, '升级请求失败'); setUpgrading(false); return; }
    // Poll for progress
    let currentStep = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = setInterval(async () => {
      pollRef.current = poll;
      try {
        const r: any = await api.get('/system/upgrade/status');
        if (r && r.step !== undefined) {
          const step = Math.min(r.step, totalSteps);
          // Mark all steps up to current as done
          setUpgradeSteps(prev => prev.map((s, i) => ({
            msg: i < step - 1 ? stepNames[i] + '完成' : (i === step - 1 ? (r.message || stepNames[i]) : ''),
            done: i < step
          })));
          if (r.complete) {
            clearInterval(poll);
            setUpgradeSteps(prev => prev.map(s => ({ ...s, done: true })));
            setUpgrading(false);
            setUpgradeComplete(true);
          }
        }
      } catch {
        // Server might be restarting, keep polling
      }
    }, 1500);
  };

  const handleRefreshPage = () => {
    location.reload();
  };

  // === Notifications ===
  const openEditChannel = (key: string) => { setEditingChannel(key); setChannelForm(channels.find(c => c.key === key)?.fields.reduce((a, f) => ({ ...a, [f.f]: notifSettings[f.f] || '' }), {}) || {}); setShowSecret({}); setTestResult(null); };
  const saveChannel = async () => {
    try {
      const updated = { ...notifSettings, ...channelForm };
      await api.put('/system/notification-settings', updated);
      setNotifSettings(updated);
      const ch = channels.find(c => c.key === editingChannel);
      const hasConfig = ch?.fields.every(f => channelForm[f.f]) || false;
      setChannelStatus(s => ({ ...s, [editingChannel!]: hasConfig }));
      setEditingChannel(null);
      showMsg(true, '配置已保存');
    } catch (e: any) { showMsg(false, e.message || '保存失败'); }
  };
  const handleTestChannel = async () => {
    const ch = channels.find(c => c.key === editingChannel);
    if (!ch) return;
    const hasConfig = ch.fields.every(f => channelForm[f.f]);
    if (!hasConfig) { setTestResult({ ok: false, text: '请先填写所有必填配置项' }); return; }
    setTesting(true);
    setTestResult(null);
    const updated = { ...notifSettings, ...channelForm, method: editingChannel };
    try {
      await api.put('/system/notification-settings', updated);
      await api.post('/system/notification-settings/test?type=daily');
      setChannelStatus(s => ({ ...s, [editingChannel!]: true }));
      setTestResult({ ok: true, text: '测试成功，推送已发送' });
    } catch (e: any) {
      setTestResult({ ok: false, text: e.message || '测试失败，请检查配置' });
    } finally {
      const restored = { ...updated, method: 'none' };
      await api.put('/system/notification-settings', restored).catch(() => {});
      setNotifSettings(restored);
      setTesting(false);
    }
  };
  const handleToggleNotif = async (key: string) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    try { await api.put('/system/notification-settings', updated); } catch {}
  };

  const channels = [
    { key: 'pushplus', label: 'PushPlus', fields: [{ f: 'pushplus_token', label: 'Token', secret: true }] },
    { key: 'serverchan', label: 'Server酱', fields: [{ f: 'serverchan_key', label: 'SendKey', secret: true }] },
    { key: 'wecom', label: '企业微信', fields: [{ f: 'wecom_corpid', label: 'CorpID' }, { f: 'wecom_agentid', label: 'AgentID' }, { f: 'wecom_secret', label: 'Secret', secret: true }, { f: 'wecom_userid', label: 'UserID' }, { f: 'wecom_proxy_url', label: '代理地址' }] },
  ];
  const reportOptions = [
    { key: 'push_daily_report', label: '每日简报' },
    { key: 'push_weekly_report', label: '每周简报' },
    { key: 'push_monthly_report', label: '每月简报' },
    { key: 'push_review_reminder', label: '待审核提醒' },
    { key: 'push_alert', label: '异常警告' },
  ];
  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-400';
  const fmtUptime = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return (d > 0 ? d + '天 ' : '') + h + '小时 ' + m + '分钟'; };

  return (
    <div className="space-y-4">
      <PageHeader title="系统设置" subtitle="服务器与系统管理" />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 no-scrollbar">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${tab === t.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>
      {msg && <div className={`rounded-xl p-3 text-sm ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{msg.text}</div>}

      {/* === System Info === */}
      {tab === 'info' && (
        <GlassCard className="p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Server className="h-4 w-4 text-indigo-500" />服务器信息</h3>
          {info ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[{ icon: Info, label: '系统版本', value: 'v' + (info.version || '1.0.0') }, { icon: Cpu, label: 'CPU', value: info.cpu }, { icon: HardDrive, label: '内存', value: info.memory }, { icon: Database, label: '数据库', value: info.dbSize }, { icon: RefreshCw, label: '运行时间', value: fmtUptime(info.uptime || 0) }, { icon: Server, label: '门店数', value: info.storeCount }].map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50"><item.icon className="h-4 w-4 text-indigo-500" /></div>
                  <div><div className="text-xs text-slate-500">{item.label}</div><div className="text-sm font-semibold text-slate-800">{item.value}</div></div>
                </div>
              ))}
            </div>
          ) : <div className="py-8 text-center text-sm text-slate-400">加载中..</div>}
        </GlassCard>
      )}

      {/* === Backup === */}
      {tab === 'backup' && (
        <div className="space-y-3">
          <GlassCard className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4 text-indigo-500" />自动备份</h3>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-700">启用自动备份</span>
              <button onClick={() => setAutoBackup((a: any) => ({ ...a, enabled: !a.enabled }))} className={`relative h-6 w-11 rounded-full transition-colors ${autoBackup.enabled ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoBackup.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {autoBackup.enabled && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">备份频率</label>
                  <select value={autoBackup.interval || 'daily'} onChange={e => setAutoBackup((a: any) => ({ ...a, interval: e.target.value }))} className={inputCls}>
                    <option value="hourly">每小时</option>
                    <option value="daily">每天</option>
                    <option value="weekly">每周</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">保留份数</label>
                  <input type="number" min="1" max="100" value={autoBackup.keepCount || 30} onChange={e => setAutoBackup((a: any) => ({ ...a, keepCount: Number(e.target.value) || 30 }))} className={inputCls} />
                  <p className="mt-1 text-xs text-slate-400">超过保留份数的旧备份将自动删除</p>
                </div>
                <button onClick={async () => { try { await api.put('/system/auto-backup', autoBackup); showMsg(true, '自动备份设置已保存'); } catch (e: any) { showMsg(false, e.message); } }} className="btn w-full text-sm">保存设置</button>
              </div>
            )}
          </GlassCard>
          <GlassCard className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Database className="h-4 w-4 text-indigo-500" />备份管理</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => backupFileRef.current?.click()} disabled={uploadingBackup} className="btn-ghost text-xs"><Upload className="mr-1 h-3.5 w-3.5" />{uploadingBackup ? '上传中..' : '上传备份'}</button>
                <button onClick={handleBackup} className="btn text-xs"><Plus className="mr-1 h-3.5 w-3.5" />创建备份</button>
              </div>
            </div>
            <input ref={backupFileRef} type="file" accept=".db,.zip" onChange={handleUploadBackup} className="hidden" />
            {backups.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">暂无备份</div> : (
              <div className="space-y-2">
                {backups.map((b: any) => {
                  const type = getBackupType(b.filename);
                  return (
                    <div key={b.filename} className="flex items-center justify-between rounded-xl bg-slate-50 p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50"><Database className="h-4 w-4 text-blue-500" /></div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + type.color}>{type.label}</span>
                            <span className="text-sm font-medium text-slate-800">{b.filename}</span>
                          </div>
                          <div className="text-xs text-slate-400">{b.size} · {new Date(b.date).toLocaleString('zh-CN')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleRestore(b.filename)} className="rounded-lg p-2 text-blue-500 hover:bg-blue-50" title="恢复"><RotateCcw className="h-4 w-4" /></button>
                        <button onClick={() => handleDownload(b.filename)} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50" title="下载"><Download className="h-4 w-4" /></button>
                        <button onClick={() => handleDeleteBackup(b.filename)} className="rounded-lg p-2 text-rose-400 hover:bg-rose-50" title="删除"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </GlassCard>
        </div>
        
      )}

      {/* === Upgrade === */}
      {tab === 'upgrade' && (
        <div className="space-y-3">
          <GlassCard className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><Upload className="h-4 w-4 text-indigo-500" />系统升级</h3>
            <div className="mb-4 rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">当前版本</div>
              <div className="text-lg font-bold text-indigo-600">v{info?.version || '1.0.0'}</div>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-8 transition-colors hover:border-indigo-300">
              <Upload className="mb-2 h-8 w-8 text-slate-400" />
              <span className="text-sm text-slate-500">{validating ? '验证中..' : '点击选择ZIP升级包'}</span>
              <input type="file" accept=".zip" onChange={handleUpgradeSelect} className="hidden" disabled={validating} />
            </label>
            {upgradeInfo && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Check className="h-5 w-5 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-700">升级包验证通过</span>
                  </div>
                  <div className="space-y-1 text-sm text-slate-600">
                    <div>文件名: {upgradeInfo.file}</div>
                    <div>版本: <span className="font-bold text-indigo-600">v{upgradeInfo.version}</span></div>
                  </div>
                </div>
                <button onClick={handleStartUpgrade} className="btn w-full">开始升级</button>
              </div>
            )}
          </GlassCard>
        </div>
      )}

      {/* === Notifications === */}
      {tab === 'notif' && (
        <div className="space-y-3">
          <GlassCard className="p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">渠道配置</h3>
            <div className="space-y-3">
              {channels.map((ch) => {
                const configured = channelStatus[ch.key];
                return (
                  <div key={ch.key} className={`flex items-center justify-between rounded-xl p-3 transition-all ${configured ? 'bg-emerald-50/80 border border-emerald-200' : 'bg-white/40'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${configured ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div>
                        <div className="text-sm font-medium text-slate-700">{ch.label}</div>
                        <div className="text-xs text-slate-400">{configured ? '已配置' : '未配置'}</div>
                      </div>
                    </div>
                    <button onClick={() => openEditChannel(ch.key)} className="rounded-lg bg-white/60 p-2 text-slate-500 hover:bg-white/80"><Edit2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-400">配置了多个渠道时，消息将同时推送到所有已配置的渠道。</p>
          </GlassCard>
          <GlassCard className="p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-700">推送内容</h3>
            <div className="space-y-2">
              {reportOptions.map((opt) => (
                <label key={opt.key} className="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 p-3 hover:bg-white/60 transition-all">
                  <span className="text-sm text-slate-700">{opt.label}</span>
                  <div className={`relative h-6 w-11 rounded-full transition-colors ${notifSettings[opt.key] ? 'bg-indigo-500' : 'bg-slate-300'}`} onClick={() => handleToggleNotif(opt.key)}>
                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${notifSettings[opt.key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </label>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* === Permissions === */}
      {tab === 'perms' && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">权限说明</h3>
          <div className="space-y-3">
            {[{ role: '管理员(ADMIN)', desc: '拥有所有功能的访问权限', color: 'bg-indigo-50 text-indigo-600' }, { role: '店长(MANAGER)', desc: '管理门店日常运营、员工、工资、记账、盘点、开闭店', color: 'bg-emerald-50 text-emerald-600' }, { role: '员工(STAFF)', desc: '可以记账、盘点、开闭店，查看基础数据', color: 'bg-amber-50 text-amber-600' }, { role: '股东(SHAREHOLDER)', desc: '查看报表和分红信息，只读权限', color: 'bg-violet-50 text-violet-600' }].map((r) => (
              <div key={r.role} className="rounded-xl bg-slate-50 p-3">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${r.color}`}>{r.role}</span>
                <span className="text-sm text-slate-600">{r.desc}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

        {/* === Restore Progress Modal === */}
        <Modal open={showRestoreModal} onClose={() => { if (restoreComplete || !restoring) { setShowRestoreModal(false); setRestoreFilename(''); setRestoreComplete(false); } }} title="恢复数据">
          <div className="space-y-4">
            {!restoreComplete && !restoring && (
              <>
                <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-700">
                    <div className="font-medium mb-1">确认恢复此备份？</div>
                    <div className="text-xs text-amber-600">当前数据将被覆盖，系统会自动备份当前数据库</div>
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3 text-sm">
                  <div className="text-slate-500">备份文件</div>
                  <div className="font-medium text-slate-800">{restoreFilename}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowRestoreModal(false)} className="btn-ghost flex-1">取消</button>
                  <button onClick={() => confirmRestore()} className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">确认恢复</button>
                </div>
              </>
            )}
            {restoreSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-all ${step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {step.done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm ${step.done ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>{step.msg}</div>
                </div>
                {restoring && step.done && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
              </div>
            ))}
            {restoring && !restoreComplete && (
              <div className="flex items-center justify-center gap-2 py-3 text-sm text-indigo-600">
                <Loader2 className="h-4 w-4 animate-spin" />正在恢复数据...
              </div>
            )}
            {restoreComplete && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="rounded-xl bg-emerald-50 p-4 text-center">
                  <Check className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <div className="text-lg font-bold text-emerald-700">恢复完成</div>
                  <div className="text-xs text-emerald-500 mt-1">数据已恢复，服务器已重启</div>
                </div>
                <button onClick={handleRefreshAfterRestore} className="btn w-full flex items-center justify-center gap-2">
                  <RefreshCw className="h-4 w-4" />确认并刷新页面
                </button>
              </div>
            )}
          </div>
        </Modal>

            {/* === Upgrade Confirm Modal === */}
      <Modal open={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="确认升级">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <div className="font-medium mb-1">升级前请确认：</div>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-600">
                <li>系统将自动备份当前数据库</li>
                <li>升级过程中服务会短暂中断</li>
                <li>建议在业务低峰期进行升级</li>
              </ul>
            </div>
          </div>
          <div className="text-sm text-slate-600">升级到版本: <span className="font-bold text-indigo-600">v{upgradeInfo?.version}</span></div>
          <div className="flex gap-2">
            <button onClick={() => setShowConfirmModal(false)} className="btn-ghost flex-1">取消</button>
            <button onClick={handleConfirmUpgrade} className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">确认升级</button>
          </div>
        </div>
      </Modal>

      {/* === Upgrade Progress Modal === */}
      <Modal open={showProgressModal} onClose={() => { if (upgradeComplete || !upgrading) { setShowProgressModal(false); setUpgradeFile(null); setUpgradeInfo(null); setUpgradeComplete(false); } }} title="系统升级">
        <div className="space-y-4">
          {upgradeSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 transition-all ${step.done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                {step.done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${step.done ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                  {['备份数据库', '解压升级包', '更新版本信息', '覆盖系统文件', '完成'][i]}
                </div>
                {step.msg && <div className="text-xs text-slate-500 mt-0.5 truncate">{step.msg}</div>}
              </div>
              {upgrading && step.done && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
            </div>
          ))}
          {upgrading && !upgradeComplete && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-indigo-600">
              <Loader2 className="h-4 w-4 animate-spin" />正在执行升级...
            </div>
          )}
          {upgradeComplete && (
            <div className="space-y-3 border-t border-slate-100 pt-4">
              <div className="rounded-xl bg-emerald-50 p-4 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                <div className="text-lg font-bold text-emerald-700">升级完成</div>
                <div className="text-xs text-emerald-500 mt-1">系统已更新到最新版本</div>
              </div>
              <button onClick={handleRefreshPage} className="btn w-full flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4" />确认并刷新页面
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* === Channel Edit Modal === */}
      <Modal open={!!editingChannel} onClose={() => setEditingChannel(null)} title={'配置 ' + (channels.find(c => c.key === editingChannel)?.label || '')}>
        <div className="space-y-4">
          {editingChannel && channels.find(c => c.key === editingChannel)?.fields.map((f: any) => (
            <div key={f.f}>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">{f.label}</label>
              <div className="relative">
                <input type={f.secret && !showSecret[f.f] ? 'password' : 'text'} value={channelForm[f.f] || ''} onChange={e => setChannelForm((s: any) => ({ ...s, [f.f]: e.target.value }))} className={inputCls} placeholder={'请输入 ' + f.label} />
                {f.secret && <button onClick={() => setShowSecret(s => ({ ...s, [f.f]: !s[f.f] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showSecret[f.f] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>}
              </div>
            </div>
          ))}
          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl p-3 text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {testResult.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              {testResult.text}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={saveChannel} className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">保存</button>
            <button onClick={handleTestChannel} disabled={testing} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50">
              {testing ? <><Loader2 className="h-4 w-4 animate-spin" />测试中...</> : <><Send className="h-4 w-4" />测试</>}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}