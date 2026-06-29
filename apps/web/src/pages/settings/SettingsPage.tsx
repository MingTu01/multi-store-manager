import { showToast } from '../../components/Toast';
import { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { GlassCard } from '../../components/GlassCard';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { Server, Database, Upload, Send, Info, Save, HardDrive, Cpu, RefreshCw, Download, Trash2, RotateCcw, Plus, Edit2, Check, X, Eye, EyeOff, Loader2, AlertCircle, ScanLine, Settings } from 'lucide-react';
import { useConfirm } from '../../components/useConfirm';
import { getBaseURL } from '../../lib/config';

type Tab = 'info' | 'backup' | 'upgrade' | 'perms' | 'ocr';
const tabs: { key: Tab; label: string; icon: any }[] = [
  { key: 'info', label: '系统信息', icon: Server },
  { key: 'backup', label: '数据备份', icon: Database },
  { key: 'upgrade', label: '系统升级', icon: Upload },
  { key: 'perms', label: '权限说明', icon: Info },
  { key: 'ocr', label: 'OCR 配置', icon: ScanLine },
];

export default function SettingsPage() {
  // 清除 SW 缓存后刷新（升级后必须清除旧缓存）
  const reloadWithCacheClear = async () => {
    try {
      // 1. 清除所有 SW 缓存
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map(n => caches.delete(n)));
      }
      // 2. 注销所有 SW
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }  } catch (_) { /* ignore */ }
    // 3. 强制刷新（不走缓存）
    window.location.replace(window.location.href);
};

 
  const [tab, setTab] = useState<Tab>('info');
  const { confirm, ConfirmDialog } = useConfirm();
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
  // msg state removed - using showToast
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
  const [showOnlineConfirm, setShowOnlineConfirm] = useState(false);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [upgradeSteps, setUpgradeSteps] = useState<{ msg: string; done: boolean }[]>([]);
  const [upgradeComplete, setUpgradeComplete] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<any>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateSteps, setUpdateSteps] = useState<{msg: string; done: boolean}[]>([]);
  const [upgrading, setUpgrading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSpeed, setUploadSpeed] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // OCR config states
  const [ocrConfig, setOcrConfig] = useState<any>(null);
  const [ocrForm, setOcrForm] = useState({ accessKeyId: '', accessKeySecret: '', endpoint: 'ocr-api.cn-hangzhou.aliyuncs.com', regionId: 'cn-hangzhou' });
  const [ocrSaving, setOcrSaving] = useState(false);
  const [showOcrKey, setShowOcrKey] = useState(false);

  // Notification channels config
  const channels = [
    { key: 'pushplus', label: 'PushPlus', fields: [{ f: 'pushplus_token', label: 'Token', secret: true }] },
    { key: 'wecom', label: '企业微信', fields: [{ f: 'wecom_corpid', label: 'CorpID' }, { f: 'wecom_agentid', label: 'AgentID' }, { f: 'wecom_secret', label: 'Secret', secret: true }, { f: 'wecom_userid', label: 'UserID' }, { f: 'wecom_proxy_url', label: '代理地址' }] },
  ];
  const reportOptions = [
    { key: 'push_daily_report', label: '每日简报' },
    { key: 'push_weekly_report', label: '每周简报' },
    { key: 'push_monthly_report', label: '每月简报' },
    { key: 'push_review_reminder', label: '待审核提醒' },
    { key: 'push_alert', label: '异常警告' },
  ];

  const showMsg = (ok: boolean, text: string) => { showToast(text, ok ? 'success' : 'error'); };

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
    if (tab === 'ocr') {
      api.get('/health-cert/config').then((d: any) => {
        setOcrConfig(d);
        if (d.endpoint) setOcrForm(f => ({ ...f, endpoint: d.endpoint }));
        if (d.regionId) setOcrForm(f => ({ ...f, regionId: d.regionId }));
      }).catch(() => {});
    }
  }, [tab]);

  // === OCR Config ===
  const handleSaveOcr = async () => {
    if (!ocrForm.accessKeyId || !ocrForm.accessKeySecret) { showMsg(false, '请填写 AccessKeyId 和 AccessKeySecret'); return; }
    setOcrSaving(true);
    try {
      const d: any = await api.post('/health-cert/config', ocrForm);
      showMsg(true, d.message || '配置已保存');
      setOcrForm(f => ({ ...f, accessKeyId: '', accessKeySecret: '' }));
      const cfg = await api.get('/health-cert/config');
      setOcrConfig(cfg);
    } catch (e: any) { showMsg(false, e.message || '保存失败'); }
    finally { setOcrSaving(false); }
  };

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
      const r = await fetch(getBaseURL() + '/api/system/backups/upload', {
        method: 'POST',
        credentials: 'include',
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
            const r = await fetch(getBaseURL() + '/api/system/info', { credentials: 'include' });
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
    reloadWithCacheClear();
  };
  
  const handleDeleteBackup = async (filename: string) => {
    if (!await confirm({ message: '确定删除此备份？' })) return;
    try { await api.del('/system/backups/' + filename); showMsg(true, '备份已删除'); setBackups(b => b.filter(x => x.filename !== filename)); }
    catch (e: any) { showMsg(false, e.message || '删除失败'); }
  };
  const handleDownload = async (filename: string) => { try { const r = await fetch(getBaseURL() + '/api/system/backups/' + filename + '/download', { credentials: 'include' }); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); } catch (e) { showToast('下载失败', 'error'); } };
  
  // Get backup type label
  const getBackupType = (filename: string) => {
    if (filename.startsWith('manual-')) return { label: '手动', color: 'bg-blue-100 text-blue-700' };
    if (filename.startsWith('auto-')) return { label: '自动', color: 'bg-emerald-100 text-emerald-700' };
    if (filename.startsWith('pre-upgrade-')) return { label: '升级前', color: 'bg-amber-100 text-amber-700' };
    if (filename.startsWith('uploaded-')) return { label: '上传', color: 'bg-purple-100 text-purple-700' };
    return { label: '备份', color: 'bg-slate-100 text-slate-700' };
  };

  // === Upgrade ===
  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateCheckResult(null);
    try {
      const r = await api.get('/system/check-update');
      setUpdateCheckResult(r);
    } catch (e: any) { setUpdateCheckResult({ error: e.message || '检查失败' }); }
    finally { setCheckingUpdate(false); }
  };

  // Auto-check for updates every 30 seconds
  useEffect(() => {
    const check = async () => {
      try {
        const r = await api.get('/system/check-update');
        if (r && r.hasUpdate) setUpdateCheckResult(r);
      } catch {}
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleOnlineUpdate = async () => {
    setShowOnlineConfirm(true);
  };
  const handleUpgradeSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const onlineStepNames = ['备份数据', '下载更新包', '解压并更新', '重启服务'];
    if (!file.name.endsWith('.zip')) { showMsg(false, '请上传ZIP格式的升级包'); return; }
    setUpgradeFile(file);
    setUpgradeInfo(null);
    setValidating(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r: any = await fetch(getBaseURL() + '/api/system/upgrade/validate', { method: 'POST', credentials: 'include', body: fd }).then(r => {
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

  const handleOnlineConfirm = async () => {
    setShowOnlineConfirm(false);
    setShowProgressModal(true);
    setUpdating(true);
    setUpgradeComplete(false);
    const onlineStepNames = ['备份数据', '下载更新包', '解压并更新', '重启服务'];
    setUpdateSteps(onlineStepNames.map(n => ({ msg: n, done: false })));
    try {
      let maxStep = 0;
      let restartDetected = false;
      const es = new EventSource(getBaseURL() + '/api/system/upgrade-progress', { withCredentials: true });
      es.addEventListener('progress', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.step > maxStep) maxStep = d.step;
          setUpdateSteps(prev => {
            const steps = [...prev];
            const idx = d.step - 1;
            while (steps.length < d.step) steps.push({ msg: onlineStepNames[steps.length] || '', done: false });
            if (idx >= 0 && idx < steps.length) {
              steps[idx] = { msg: d.message || onlineStepNames[idx] || '', done: d.done || false };
            }
            return steps;
          });
        } catch {}
      });
      const handleRestartPoll = () => {
        if (restartDetected) return;
        restartDetected = true;
        setUpdateSteps(prev => prev.map((s, i) => ({ ...s, done: i < prev.length - 1, msg: i === prev.length - 1 ? '服务器重启中...' : s.msg })));
        (window as any).__upgradeInProgress = true;
        const stepIdx = onlineStepNames.length - 1;
        setUpdateSteps(prev => prev.map((s, i) => ({ ...s, done: i < stepIdx, msg: i === stepIdx ? '等待服务器重启...' : s.msg })));
        const waitForReady1 = () => {
          window.removeEventListener('server-ready', waitForReady1);
          delete (window as any).__upgradeInProgress;
          setUpdateSteps(prev => prev.map(s => ({ ...s, done: true })));
          setUpgradeComplete(true);
          setUpdating(false);
        };
        if ((window as any).__sseReconnected) { waitForReady1(); } else { window.addEventListener('server-ready', waitForReady1); }
        setTimeout(() => { window.removeEventListener('server-ready', waitForReady1); delete (window as any).__upgradeInProgress; waitForReady1(); }, 120000);
      };let RestartPoll: () => void; RestartPoll = () => {
        if (restartDetected) return;
        restartDetected = true;
        (window as any).__upgradeInProgress = true;
        const stepIdx2 = onlineStepNames.length - 1;
        setUpdateSteps(prev => prev.map((s, i) => ({ ...s, done: i < stepIdx2, msg: i === stepIdx2 ? '等待服务器重启...' : s.msg })));
        const waitForReady2 = () => {
          window.removeEventListener('server-ready', waitForReady2);
          delete (window as any).__upgradeInProgress;
          setUpdateSteps(prev => prev.map(s => ({ ...s, done: true })));
          setUpgradeComplete(true);
          setUpdating(false);
        };
        if ((window as any).__sseReconnected) { waitForReady2(); } else { window.addEventListener('server-ready', waitForReady2); }
        setTimeout(() => { window.removeEventListener('server-ready', waitForReady2); delete (window as any).__upgradeInProgress; waitForReady2(); }, 120000);
      };
      es.addEventListener('complete', () => { es.close(); handleRestartPoll(); });
      // Polling fallback for upgrade status (used when SSE fails)
                // Robust polling: survives server restart, updates all completed steps
        let pollAttempts = 0;
        const pollUpgradeStatus = async () => {
          if (restartDetected) return;
          pollAttempts++;
          try {
            const ctrl = new AbortController();
            const tmo = setTimeout(() => ctrl.abort(), 5000);
            const res = await fetch(getBaseURL() + '/api/system/upgrade/status', { credentials: 'include', signal: ctrl.signal });
            clearTimeout(tmo);
            if (res.ok) {
              const state = await res.json();
              if (state.step > 0 && state.step <= onlineStepNames.length) {
                if (state.step > maxStep) maxStep = state.step;
                setUpdateSteps(prev => {
                  const steps = [...prev];
                  for (let i = 0; i < Math.min(state.step, onlineStepNames.length); i++) {
                    const isDone = i < state.step - 1 || state.complete;
                    steps[i] = { msg: i === state.step - 1 ? (state.message || onlineStepNames[i]) : onlineStepNames[i], done: isDone };
                  }
                  return steps;
                });
              }
              if (state.complete) { handleRestartPoll(); return; }
              pollAttempts = 0;
            }
          } catch {
            // Server restarting, keep polling
          }
          if (!restartDetected) setTimeout(pollUpgradeStatus, pollAttempts > 10 ? 3000 : 2000);
        };;
      es.onerror = () => { 
          es.close();
          if (!restartDetected) {
            pollUpgradeStatus();
          }
        };
        await new Promise(r => setTimeout(r, 1000));
        await api.post('/system/do-update', {});
        // Start polling after do-update is sent
        setTimeout(pollUpgradeStatus, 500);
    } catch (e: any) {
      setUpdateSteps(prev => [...prev, { msg: '更新失败: ' + (e.message || '未知错误'), done: false }]);
      setUpdating(false);
    }
  };


  const handleStartUpgrade = () => { setShowConfirmModal(true); };

  const handleConfirmUpgrade = async () => {
    setShowConfirmModal(false);
    setShowProgressModal(true);
    setUpgrading(true);
    setUpgradeComplete(false);
    setUpgradeSteps([]);
    const totalSteps = 4;
    const stepNames = ['正在备份数据', '正在解压', '正在更新', '重启'];
    setUpgradeSteps(stepNames.map(n => ({ msg: n, done: false })));
    // Upload with progress
    const fd = new FormData();
    fd.append('file', upgradeFile!);
    setUploadProgress(0);
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/system/upgrade');
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100)); };
      await new Promise((resolve, reject) => { xhr.onload = resolve; xhr.onerror = reject; xhr.send(fd); });
      setUploadProgress(100);
    } catch { showMsg(false, '升级请求失败'); setUpgrading(false); return; }
    // Poll for progress — track maxStep to never go backward
    let maxStep = 0;
    let restartDetected = false;
    if (pollRef.current) clearInterval(pollRef.current);
    const poll = setInterval(async () => {
      pollRef.current = poll;
      try {
        const r = await api.get('/system/upgrade/status?t=' + Date.now());
        if (r && r.step !== undefined && r.step > 0) {
          const step = Math.min(r.step, totalSteps);
          if (step > maxStep) maxStep = step;
          setUpgradeSteps(stepNames.map((n, i) => ({ msg: n, done: i < step - 1 })));
          if (r.complete) {
            clearInterval(poll);
            setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
            setUpgrading(false);
            (window as any).__upgradeInProgress = true;
            const stepIdx3 = stepNames.length - 1;
            setUpgradeSteps(stepNames.map((n, ii) => ({ msg: n, done: ii < stepIdx3 })));
            const waitForReady3 = () => {
              window.removeEventListener('server-ready', waitForReady3);
              delete (window as any).__upgradeInProgress;
              setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
              setUpgrading(false);
              setUpgradeComplete(true);
            };
            if ((window as any).__sseReconnected) { waitForReady3(); } else { window.addEventListener('server-ready', waitForReady3); }
            setTimeout(() => { window.removeEventListener('server-ready', waitForReady3); delete (window as any).__upgradeInProgress; waitForReady3(); }, 120000);
          }
        } else if (maxStep >= 3 && !restartDetected) {
          restartDetected = true;
          clearInterval(poll);
          // Show last step as in-progress
          // Listen for server-ready SSE event
          const handleReady = () => {
            window.removeEventListener('server-ready', handleReady);
            setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
            setUpgrading(false);
            setUpgradeComplete(true);
          };
          // Check if already reconnected
          if ((window as any).__sseReconnected) {
            handleReady();
          } else {
            window.addEventListener('server-ready', handleReady);
          }
          // Fallback: mark complete after 60s
          setTimeout(() => {
            window.removeEventListener('server-ready', handleReady);
            setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
            setUpgrading(false);
            setUpgradeComplete(true);
          }, 60000);
        }
      } catch {
        if (maxStep >= 3 && !restartDetected) {
          restartDetected = true;
          clearInterval(poll);
          setUpgradeSteps(stepNames.map((n, i) => ({ msg: n, done: i < stepNames.length - 1 })));
          const handleReady = () => {
            window.removeEventListener('server-ready', handleReady);
            setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
            setUpgrading(false);
            setUpgradeComplete(true);
          };
          if ((window as any).__sseReconnected) { handleReady(); } else { window.addEventListener('server-ready', handleReady); }
          setTimeout(() => {
            window.removeEventListener('server-ready', handleReady);
            setUpgradeSteps(stepNames.map(n => ({ msg: n, done: true })));
            setUpgrading(false);
            setUpgradeComplete(true);
          }, 60000);
        }
      }
    }, 1500);
  };
  const handleRefreshPage = () => {
    reloadWithCacheClear();
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
    try {
      const testRes = await api.post('/system/notification-settings/test?type=daily', { config: channelForm });
      if (testRes.message) {
        setTestResult({ ok: true, text: '测试成功，推送已发送。请点击“保存”保存配置' });
      } else {
        setTestResult({ ok: false, text: '测试失败' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e.message || '测试失败，请检查配置' });
    } finally {
      setTesting(false);
    }
  };;
  const handleToggleNotif = async (key: string) => {
    const updated = { ...notifSettings, [key]: !notifSettings[key] };
    setNotifSettings(updated);
    try { await api.put('/system/notification-settings', updated); } catch {}
  };

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

            {/* Online Update */}
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <h4 className="mb-2 text-sm font-medium text-slate-700">在线更新</h4>
              {updateCheckResult && (
                <div className={'mb-3 rounded-xl p-3 text-sm ' + (updateCheckResult.hasUpdate ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                  {updateCheckResult.hasUpdate
                    ? '发现新版本 v' + updateCheckResult.latestVersion + '（当前 v' + updateCheckResult.currentVersion + '）'
                    : '已是最新版本 v' + updateCheckResult.currentVersion}
                </div>
              )}
              {updateCheckResult?.error && (
                <div className="mb-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-600">{updateCheckResult.error}</div>
              )}
              <div className="flex gap-2">
                <button onClick={handleCheckUpdate} disabled={checkingUpdate} className="flex-1 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 border border-slate-200">
                  {checkingUpdate ? '检查中...' : '检查更新'}
                </button>
                {updateCheckResult?.hasUpdate && (
                  <button onClick={handleOnlineUpdate} disabled={updating} className="flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
                    {updating ? '更新中...' : '执行更新'}
                  </button>
                )}
              </div>
            </div>

            {/* ZIP Upload (fallback) */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 mb-2">手动上传ZIP升级包</summary>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-6 transition-colors hover:border-indigo-300">
                <Upload className="mb-2 h-6 w-6 text-slate-400" />
                <span className="text-sm text-slate-500">{validating ? '验证中...' : '点击选择ZIP升级包'}</span>
                <input type="file" accept=".zip" onChange={handleUpgradeSelect} className="hidden" disabled={validating} />
              </label>
              {upgradeInfo && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl bg-emerald-50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Check className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-700">验证通过</span>
                    </div>
                    <div className="text-sm text-slate-600">版本: <span className="font-bold text-indigo-600">v{upgradeInfo.version}</span></div>
                  </div>
                  <button onClick={handleStartUpgrade} className="btn w-full">开始升级</button>
                </div>
              )}
            </details>
          </GlassCard>
        </div>
      )}



      {/* === Permissions === */}
      {tab === 'perms' && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">权限说明</h3>
          <div className="space-y-3">            {[{ role: '系统管理员(ADMIN)', desc: '拥有系统全部权限：店铺管理、员工管理、记账、盘点、工资、分红、报表、系统设置、数据备份、升级、消息推送配置', color: 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 border border-amber-300' }, { role: '店铺管理员(STORE_ADMIN)', desc: '拥有单店铺管理权限：修改门店信息、员工管理、记账、盘点、工资、分红、报表、店铺消息推送配置', color: 'bg-sky-50 text-sky-600' }, { role: '店长(MANAGER)', desc: '管理门店日常运营：记账、盘点、开闭店、查看员工和报表，不可修改系统设置', color: 'bg-emerald-50 text-emerald-600' }, { role: '员工(STAFF)', desc: '基础操作：记账、盘点、开闭店，查看今日数据，不可查看其他月份数据', color: 'bg-amber-50 text-amber-600' }, { role: '股东(SHAREHOLDER)', desc: '只读权限：可查看所有页面内容，不可进行任何操作', color: 'bg-violet-50 text-violet-600' }].map((r) => (
              <div key={r.role} className="rounded-xl bg-slate-50 p-3">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${r.color}`}>{r.role}</span>
                <span className="text-sm text-slate-600">{r.desc}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* === OCR Config === */}
      {tab === 'ocr' && (
        <div className="space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={'flex h-10 w-10 items-center justify-center rounded-full ' + (ocrConfig?.configured ? 'bg-emerald-50 text-emerald-500' : 'bg-amber-50 text-amber-500')}>
                <ScanLine className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">阿里云 OCR 服务</div>
                <div className={'text-xs ' + (ocrConfig?.configured ? 'text-emerald-600' : 'text-amber-600')}>
                  {ocrConfig?.configured ? '已配置' : '未配置'}
                  {ocrConfig?.configured && ocrConfig?.accessKeyIdHint && <span className="ml-1 text-slate-400">(KeyID: {ocrConfig.accessKeyIdHint})</span>}
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 leading-relaxed">
              配置阿里云 OCR 服务后，可使用健康证自动识别功能。请前往 <a href="https://ram.console.aliyun.com/manage/ak" target="_blank" className="text-indigo-500 underline">阿里云控制台</a> 获取 AccessKey。
            </div>
          </GlassCard>
          <GlassCard className="p-5 space-y-4">
            <div className="text-sm font-semibold text-slate-700">配置密钥</div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">AccessKeyId *</label>
              <input value={ocrForm.accessKeyId} onChange={e => setOcrForm(f => ({ ...f, accessKeyId: e.target.value }))} className={inputCls} placeholder="请输入 AccessKeyId" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">AccessKeySecret *</label>
              <div className="relative">
                <input type={showOcrKey ? 'text' : 'password'} value={ocrForm.accessKeySecret} onChange={e => setOcrForm(f => ({ ...f, accessKeySecret: e.target.value }))} className={inputCls + ' pr-10'} placeholder="请输入 AccessKeySecret" />
                <button onClick={() => setShowOcrKey(!showOcrKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showOcrKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Endpoint</label>
              <input value={ocrForm.endpoint} onChange={e => setOcrForm(f => ({ ...f, endpoint: e.target.value }))} className={inputCls} placeholder="ocr-api.cn-hangzhou.aliyuncs.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">RegionId</label>
              <input value={ocrForm.regionId} onChange={e => setOcrForm(f => ({ ...f, regionId: e.target.value }))} className={inputCls} placeholder="cn-shanghai" />
            </div>
            <button onClick={handleSaveOcr} disabled={ocrSaving} className="btn w-full disabled:opacity-50"><Save className="mr-1.5 h-4 w-4 inline" />{ocrSaving ? '保存中..' : '保存配置'}</button>
          </GlassCard>
        </div>
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
      {/* === Online Update Confirm Modal === */}
      <Modal open={showOnlineConfirm} onClose={() => setShowOnlineConfirm(false)} title="确认在线更新">
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-3">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-700">
              <div className="font-medium mb-1">更新前请确认：</div>
              <ul className="list-disc list-inside space-y-0.5 text-xs text-amber-600">
                <li>系统将自动备份当前数据库</li>
                <li>更新过程中服务会短暂中断</li>
                <li>建议在业务低峰期进行更新</li>
              </ul>
            </div>
          </div>
          <div className="text-sm text-slate-600">将更新到最新版本</div>
          <div className="flex gap-2">
            <button onClick={() => setShowOnlineConfirm(false)} className="btn-ghost flex-1">取消</button>
            <button onClick={handleOnlineConfirm} className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">确认更新</button>
          </div>
        </div>
      </Modal>


      {/* === Upgrade Progress Modal === */}
      <Modal open={showProgressModal} onClose={() => { if (upgradeComplete || (!upgrading && !updating)) { delete (window as any).__upgradeInProgress; fetch(getBaseURL() + '/api/system/upgrade/cleanup', { method: 'POST', credentials: 'include' }); setShowProgressModal(false); setUpgradeFile(null); setUpgradeInfo(null); setUpgradeComplete(false); } }} title={updating ? "在线更新" : "ZIP升级"}>
        <div className="space-y-6">
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 font-medium">上传升级包</span>
                <span className="text-indigo-600 font-bold">{uploadProgress}%</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300" style={{width: uploadProgress + '%'}} />
              </div>
              {uploadSpeed && <div className="text-xs text-slate-400 text-right">{uploadSpeed}</div>}
            </div>
          )}
          {(uploadProgress >= 100 || upgrading || updating) && (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
              <div className="space-y-0">
                {(updating ? updateSteps : upgradeSteps).map((step, i) => {
                  const isActive = !step.done && (i === 0 || (updating ? updateSteps : upgradeSteps)[i-1]?.done);
                  const isDone = step.done;
                  return (
                    <div key={i} className="relative flex items-start gap-4 pb-6 last:pb-0">
                      <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-500 ${isDone ? 'border-emerald-500 bg-emerald-500 scale-110' : isActive ? 'border-indigo-500 bg-white shadow-lg shadow-indigo-200 animate-pulse' : 'border-slate-300 bg-white'}`}>
                        {isDone ? <Check className="h-4 w-4 text-white" /> : isActive ? <div className="h-3 w-3 rounded-full bg-indigo-500 animate-ping" /> : <span className="text-xs font-bold text-slate-400">{i + 1}</span>}
                      </div>
                      <div className="flex-1 pt-1">
                        <div className={`text-sm font-medium transition-colors duration-300 ${isDone ? 'text-emerald-600' : isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                          {step.msg}
                        </div>
                        {isActive && <div className="text-xs text-indigo-400 mt-1 animate-pulse">执行中...</div>}
                      </div>
                    </div>
);
                })}
              </div>
            </div>
          )}
          {(upgrading || updating) && !upgradeComplete && (
            <div className="flex items-center justify-center gap-3 py-4 px-6 bg-indigo-50 rounded-xl">
              <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
              <span className="text-sm font-medium text-indigo-600">正在执行升级...</span>
            </div>
          )}
          {upgradeComplete && (
            <div className="space-y-4">
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 p-6 text-center border border-emerald-200">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                  <Check className="h-8 w-8 text-emerald-600" />
                </div>
                <div className="text-xl font-bold text-emerald-700 mb-1">升级完成</div>
                <div className="text-sm text-emerald-500">系统已更新到最新版本</div>
              </div>
              <button onClick={() => { delete (window as any).__upgradeInProgress; fetch(getBaseURL() + '/api/system/upgrade/cleanup', { method: 'POST', credentials: 'include' }); setShowProgressModal(false); setUpgradeFile(null); setUpgradeInfo(null); setUpgradeComplete(false); reloadWithCacheClear(); }} className="btn w-full flex items-center justify-center gap-2 py-3 text-base font-medium">
                <RefreshCw className="h-5 w-5" />确认并刷新页面
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
    <ConfirmDialog />
    </div>
  );
}
