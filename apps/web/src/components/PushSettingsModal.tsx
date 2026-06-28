import { showToast } from './Toast';
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useStore } from '../stores/data';
import { Modal } from './Modal';
import { GlassCard } from './GlassCard';
import { useConfirm } from './useConfirm';
import {
  Send, Check, Edit2, Plus, Eye, EyeOff, Loader2, AlertCircle,
  Bell, Settings2, Clock, ExternalLink, Smartphone,
} from 'lucide-react';

/* ---------- 常量 ---------- */

interface ChannelDef {
  key: string;
  label: string;
  adminOnly?: boolean;
  fields: { f: string; label: string; secret: boolean }[];
}

const CHANNELS: ChannelDef[] = [
  {
    key: 'pushplus',
    label: 'PushPlus',
    fields: [{ f: 'pushplus_token', label: 'Token', secret: true }],
  },
    {
    key: 'wecom',
    label: '企业微信自建应用',
    adminOnly: true,
    fields: [
      { f: 'wecom_corpid', label: 'CorpID', secret: false },
      { f: 'wecom_agentid', label: 'AgentID', secret: false },
      { f: 'wecom_secret', label: 'Secret', secret: true },
      { f: 'wecom_userid', label: 'UserID', secret: false },
      { f: 'wecom_proxy_url', label: '代理URL', secret: false },
    ],
  },
  {
    key: 'iyuu',
    label: '爱语飞飞',
    fields: [{ f: 'iyuu_token', label: 'Token', secret: true }],
  },
];

/** 渠道教程链接 */
const CHANNEL_TUTORIALS: Record<string, { url: string; desc: string }> = {
  pushplus: { url: 'https://www.pushplus.plus/push1.html', desc: '注册后获取Token' },
    wecom: { url: 'https://developer.work.weixin.qq.com/document/path/90236', desc: '创建自建应用获取配置' },
  iyuu: { url: 'https://iyuu.cn/', desc: '关注公众号获取Token' },
};

interface PushOption {
  key: string;
  label: string;
  category: string;
  roles: string[];
  priority: 'high' | 'medium' | 'low';
  defaultSelected: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; bgOff: string; text: string; dot: string }> = {
  '经营报表': { bg: 'bg-blue-50 border-blue-200 text-blue-700', bgOff: 'bg-slate-50 text-slate-400', text: 'text-blue-700', dot: 'bg-blue-500' },
  '异常审核': { bg: 'bg-rose-50 border-rose-200 text-rose-700', bgOff: 'bg-slate-50 text-slate-400', text: 'text-rose-700', dot: 'bg-rose-500' },
  '门店运营': { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', bgOff: 'bg-slate-50 text-slate-400', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  '人事财务': { bg: 'bg-amber-50 border-amber-200 text-amber-700', bgOff: 'bg-slate-50 text-slate-400', text: 'text-amber-700', dot: 'bg-amber-500' },
};

const PUSH_OPTIONS: PushOption[] = [
  // 经营报表
  { key: 'push_daily_report', label: '每日经营简报', category: '经营报表', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'medium', defaultSelected: true },
  { key: 'push_weekly_report', label: '每周经营报告', category: '经营报表', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'low', defaultSelected: false },
  { key: 'push_monthly_report', label: '月度经营报告', category: '经营报表', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'low', defaultSelected: false },
  // 异常与审核
  { key: 'push_alert', label: '异常警告', category: '异常审核', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'high', defaultSelected: true },
  { key: 'push_review_reminder', label: '审核提醒', category: '异常审核', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'medium', defaultSelected: false },
  { key: 'push_inventory_alert', label: '库存异常', category: '异常审核', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'high', defaultSelected: true },
  { key: 'push_store_alert', label: '门店异常', category: '异常审核', roles: ['ADMIN'], priority: 'high', defaultSelected: true },
  // 门店运营
  { key: 'push_openclose_notify', label: '开闭店通知', category: '门店运营', roles: ['ADMIN', 'STORE_ADMIN', 'MANAGER'], priority: 'medium', defaultSelected: true },
  { key: 'push_bookkeeping_notify', label: '记账通知', category: '门店运营', roles: ['ADMIN', 'STORE_ADMIN', 'MANAGER'], priority: 'low', defaultSelected: false },
  { key: 'push_inventory_notify', label: '盘点通知', category: '门店运营', roles: ['ADMIN', 'STORE_ADMIN', 'MANAGER'], priority: 'low', defaultSelected: false },
  { key: 'push_purchase_notify', label: '进货通知', category: '门店运营', roles: ['ADMIN', 'STORE_ADMIN', 'MANAGER'], priority: 'low', defaultSelected: false },
  // 人事与财务
  { key: 'push_salary_confirm', label: '工资确认通知', category: '人事财务', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'medium', defaultSelected: true },
  { key: 'push_salary_notify', label: '工资发放通知', category: '人事财务', roles: ['STAFF'], priority: 'medium', defaultSelected: true },
  { key: 'push_dividend_notify', label: '分红发放通知', category: '人事财务', roles: ['SHAREHOLDER', 'ADMIN'], priority: 'medium', defaultSelected: true },
  { key: 'push_health_cert', label: '健康证到期提醒', category: '人事财务', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'high', defaultSelected: true },
  { key: 'push_staff_change', label: '员工变动通知', category: '人事财务', roles: ['ADMIN', 'STORE_ADMIN'], priority: 'medium', defaultSelected: false },
];

const INPUT_CLS =
  'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100';

/* ---------- 组件 ---------- */

export function PushSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useStore((s) => s.user);
const role = user?.role ?? '';


  const [settings, setSettings] = useState<Record<string, any>>({});
  const [channelStatus, setChannelStatus] = useState<Record<string, boolean>>({});
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [channelForm, setChannelForm] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [testCooldown, setTestCooldown] = useState(0);
  const [channelTested, setChannelTested] = useState<Record<string, boolean>>({});
  const [showPushPicker, setShowPushPicker] = useState(false);
  // msg state removed - using showToast instead
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- PWA 浏览器推送通知状态 ---- */
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [isIOS, setIsIOS] = useState(false);
  const [hasPushSub, setHasPushSub] = useState(false);
  

  /* ---- 可见渠道 & 推送选项 ---- */
  const visibleChannels = CHANNELS.filter(
    (ch) => !ch.adminOnly || role === 'ADMIN',
  );
  const visiblePushOptions = PUSH_OPTIONS.filter((o) => o.roles.includes(role));

  /* ---- 提示 ---- */
  const showMsg = useCallback((ok: boolean, text: string) => {
    showToast(text, ok ? 'success' : 'error');
  }, []);

  /* ---- 检查浏览器推送通知权限 + 订阅状态 ---- */
  useEffect(() => {
    if (!open) return;
    const ua = navigator.userAgent || '';
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    if ('Notification' in window && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setHasPushSub(!!sub);
        setNotifPermission(Notification.permission);
        
      }).catch(() => {
        setNotifPermission(Notification.permission);
      });
    }
  }, [open]);

  /* ---- 请求浏览器推送通知权限并订阅 ---- */
  /** 检测是否为 Chrome（非 Edge、非 Opera） */
  const isFCMBrowser = () => {
    const ua = navigator.userAgent;
    return /Chrome\//.test(ua) && !/Edg/.test(ua) && !/OPR\//.test(ua) && !/Brave/.test(ua) && !/SamsungBrowser/i.test(ua);
  };

  /** 快速测试 Google FCM 连通性 */
  const testFCMConnectivity = (): Promise<boolean> => {
    return Promise.race([
      fetch("https://fcmregistrations.googleapis.com/", { method: "HEAD", mode: "no-cors" })
        .then(() => true)
        .catch(() => false),
      new Promise<boolean>((r) => setTimeout(() => r(false), 5000))
    ]);
  };

  const handleRequestNotifPermission = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      showMsg(false, "当前浏览器不支持推送通知");
      return;
    }

    // Chrome 特殊检测：测试 FCM 连通性
    if (isFCMBrowser()) {
      const fcmOk = await testFCMConnectivity();
      if (!fcmOk) {
        showMsg(false, "Chrome 无法连接 Google 推送服务（国内网络限制）。请使用 Edge、Firefox 或 Safari 浏览器开启推送通知。");
        return;
      }
    }
    try {
      if (Notification.permission === "denied") {
        showMsg(false, "通知权限已被拒绝，请在浏览器地址栏左侧设置中重置为允许");
        return;
      }
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result !== "granted") {
        if (result === "denied") showMsg(false, "通知权限被拒绝");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // 取消旧订阅
      try {
        const old = await reg.pushManager.getSubscription();
        if (old) {
          await old.unsubscribe();
        }
      } catch (_) {}

      // 获取 VAPID key
      const vapidRes = await api.get("/system/push/vapid-key") as any;
      const vapidKey = vapidRes.publicKey;
      const base64 = vapidKey.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
      const raw = atob(padded);
      const appKey = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i);
      // Subscribe with timeout fallback for mobile browsers
      let sub: PushSubscription | null = null;
      try {
        sub = await Promise.race([
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }),
          new Promise<null>((r) => setTimeout(() => r(null), 10000))
        ]);
      } catch (subErr) {
        // Some mobile browsers need polling fallback
      }
      // Polling fallback if subscribe didn't resolve
      if (!sub) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          sub = await reg.pushManager.getSubscription();
          if (sub) break;
        }
      }

      if (!sub) {
        const hint = isFCMBrowser()
          ? "Chrome 在当前网络下无法使用推送，请使用 Edge、Firefox 或 Safari"
          : "推送订阅失败，请检查浏览器通知设置";
        showMsg(false, hint);
        return;
      }

      const subJson = sub.toJSON();
      await api.post("/system/push/subscribe", { endpoint: subJson.endpoint, keys: subJson.keys });
      setHasPushSub(true);
      showMsg(true, "浏览器推送已开启");
    } catch (e: any) {
      showMsg(false, "开启推送失败: " + (e.message || "未知错误"));
    }
  };

  /* ---- 加载设置 ---- */
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingChannel(null);
    setTestResult(null);
    setTestCooldown(0);
    api
      .get('/system/user-notification-settings')
      .then((d: any) => {
        const defaults: Record<string, any> = {};
        visiblePushOptions.forEach(o => {
          if (d[o.key] === undefined) defaults[o.key] = o.defaultSelected;
        });
        setSettings({ ...defaults, ...d });
        const status: Record<string, boolean> = {};
        visibleChannels.forEach((ch) => {
          status[ch.key] = ch.fields.every((f) => !!d[f.f]);
        });
        setChannelStatus(status);
      })
      .catch(() => showMsg(false, '加载设置失败'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---- 倒计时清理 ---- */
  useEffect(() => {
    if (testCooldown <= 0 && cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
  }, [testCooldown]);

  /* ---- 切换推送开关 ---- */
  const handleToggle = (key: string) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  /* ---- 打开渠道编辑 ---- */
  const openEditChannel = (ch: ChannelDef) => {
    setEditingChannel(ch.key);
    setChannelForm(ch.fields.reduce((a, f) => ({ ...a, [f.f]: settings[f.f] || '' }), {}));
    setShowSecret({});
    setTestResult(null);
    setChannelTested((s) => ({ ...s, [ch.key]: false }));
  };

  /* ---- 渠道表单中保存配置到本地 ---- */
  const handleChannelSave = () => {
    if (!channelTested[editingChannel!]) {
      showMsg(false, '请先测试成功后再保存');
      return;
    }
    setSettings((s) => ({ ...s, ...channelForm }));
    const ch = visibleChannels.find((c) => c.key === editingChannel);
    const hasConfig = ch?.fields.every((f) => !!channelForm[f.f]) ?? false;
    setChannelStatus((s) => ({ ...s, [editingChannel!]: hasConfig }));
    setEditingChannel(null);
    showMsg(true, '渠道配置已更新，请记得保存');
  };

  /* ---- 测试推送 ---- */
  const handleTest = async () => {
    const ch = visibleChannels.find((c) => c.key === editingChannel);
    const hasConfig = ch?.fields.every((f) => !!channelForm[f.f]) ?? false;
    if (!hasConfig) {
      setTestResult({ ok: false, text: '请先填写所有必填配置项' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.post(
        '/system/user-notification-settings/test?channel=' + editingChannel,
        { config: channelForm },
      );
      if (res.results && res.results.length > 0) {
        setChannelTested((s) => ({ ...s, [editingChannel!]: true }));
        setTestResult({
          ok: true,
          text: '测试成功！请点击"确定"保存配置。',
        });
      } else {
        setTestResult({
          ok: false,
          text: '推送失败: ' + (res.errors ? res.errors.join('; ') : '未知错误'),
        });
      }
    } catch (e: any) {
      setTestResult({ ok: false, text: e.message || '测试失败，请检查配置' });
    } finally {
      setTesting(false);
      setTestCooldown(60);
      cooldownRef.current = setInterval(() => {
        setTestCooldown((c) => (c > 0 ? c - 1 : 0));
      }, 1000);
    }
  };

  /* ---- 保存全部设置 ---- */
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system/user-notification-settings', settings);
      showMsg(true, '设置已保存');
    } catch (e: any) {
      showMsg(false, e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- 渲染 ---------- */
  return (
    <>
    <Modal open={open} onClose={onClose} title="推送设置" wide>
      <div className="space-y-5">
        {/* Toast 提示由全局 ToastContainer 处理 */}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            加载中…
          </div>
        ) : (
          <>
            {/* ===== 渠道配置 ===== */}
            <GlassCard className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Settings2 className="h-4 w-4 text-indigo-500" />
                渠道配置
              </h3>
              <div className="space-y-2.5">
                {visibleChannels.map((ch) => {
                  const configured = channelStatus[ch.key];
                  const tutorial = CHANNEL_TUTORIALS[ch.key];
                  return (
                    <div
                      key={ch.key}
                      className={`flex items-center justify-between rounded-xl p-3 transition-all ${
                        configured
                          ? 'border border-emerald-200 bg-emerald-50/80'
                          : 'bg-white/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-2.5 w-2.5 rounded-full ${
                            configured ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        />
                        <div>
                          <div className="text-sm font-medium text-slate-700">
                            {ch.label}
                          </div>
                          <div className="text-xs text-slate-400">
                            {configured ? '已配置' : '未配置'}
                            {tutorial && (
                              <>
                                {' · '}
                                <span className="text-slate-400">{tutorial.desc}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {tutorial && (
                          <a
                            href={tutorial.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-lg bg-white/60 px-2 py-1.5 text-xs text-indigo-500 hover:bg-white/80 hover:text-indigo-700"
                            title="查看教程"
                          >
                            <ExternalLink className="h-3 w-3" />
                            教程
                          </a>
                        )}
                        <button
                          onClick={() => openEditChannel(ch)}
                          className="rounded-lg bg-white/60 p-2 text-slate-500 hover:bg-white/80"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-400">
                配置了多个渠道时，消息将同时推送到所有已配置的渠道。
              </p>
            </GlassCard>

            {/* ===== 浏览器推送通知 ===== */}
            <GlassCard className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Bell className="h-4 w-4 text-indigo-500" />
                浏览器推送通知
              </h3>
              <div className="flex items-center justify-between rounded-xl bg-white/40 p-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      notifPermission === 'granted'
                        ? 'bg-emerald-500'
                        : notifPermission === 'denied'
                        ? 'bg-rose-500'
                        : 'bg-slate-300'
                    }`}
                  />
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      浏览器推送通知
                    </div>
                    <div className="text-xs text-slate-400">
                      {notifPermission === 'granted' && hasPushSub
                        ? '已开启 · 已订阅'
                        : notifPermission === 'granted'
                        ? '已授权 · 未订阅'
                        : notifPermission === 'denied'
                        ? '已拒绝，请到浏览器设置中开启通知权限'
                        : '未开启'}
                    </div>
                  </div>
                </div>
                {notifPermission === 'granted' && hasPushSub ? (
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.post('/system/push/test') as any;
                        showMsg(true, '测试推送已发送，请查看设备通知');
                      } catch(e:any) { showMsg(false, e.message || '发送失败'); }
                    }}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                  >
                    测试推送
                  </button>
                ) : notifPermission === 'granted' && !hasPushSub ? (
                  <button
                    onClick={handleRequestNotifPermission}
                    className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-100"
                  >
                    订阅推送
                  </button>
                ) : notifPermission === 'denied' ? (
                  <span className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-500">
                    已拒绝
                  </span>
                ) : (
                  <button
                    onClick={handleRequestNotifPermission}
                    className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                  >
                    开启通知
                  </button>
                )}
              </div>
              {isIOS && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
                  <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    iOS Safari 需要将本站添加到主屏幕（PWA 模式）才能使用浏览器推送通知。
                  </span>
                </div>
              )}
              {isFCMBrowser() && (
                <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Chrome 在国内网络下可能无法使用推送通知（需连接 Google 服务）。如遇问题，请使用 <strong>Edge</strong>、<strong>Firefox</strong> 或 <strong>Safari</strong>。
                  </span>
                </div>
              )}
            </GlassCard>

            {/* ===== 推送内容 ===== */}
            {visiblePushOptions.length > 0 && (
              <GlassCard className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Bell className="h-4 w-4 text-indigo-500" />
                  推送内容
                </h3>
                <div className="flex flex-wrap gap-2">
                  {visiblePushOptions.filter(o => settings[o.key]).map(o => (
                    <span key={o.key} className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${(CATEGORY_COLORS[o.category] || CATEGORY_COLORS['经营报表']).bg}`}>
                      {o.label}
                      <button onClick={() => handleToggle(o.key)} className="ml-0.5 hover:text-indigo-900">&times;</button>
                    </span>
                  ))}
                  <button
                    onClick={() => setShowPushPicker(true)}
                    className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-500"
                  >
                    <Plus className="h-3 w-3" /> 添加推送内容
                  </button>
                </div>
                {visiblePushOptions.filter(o => settings[o.key]).length === 0 && (
                  <p className="mt-2 text-xs text-slate-400">未选择任何推送内容</p>
                )}
              </GlassCard>
            )}

            {/* ===== 保存按钮 ===== */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {saving ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 保存中…
                </span>
              ) : (
                '保存设置'
              )}
            </button>
          </>
        )}
      </div>

      {/* ===== 渠道编辑弹窗 ===== */}
      <Modal
        open={!!editingChannel}
        onClose={async () => {
          const ch = visibleChannels.find((c) => c.key === editingChannel);
          if (ch && channelStatus[ch.key] && !channelTested[ch.key]) {
            if (await confirm({ message: '测试未完成，当前配置将被清除。确认关闭？' })) {
              setChannelForm((s) => {
                const n = { ...s };
                ch.fields.forEach((f) => delete n[f.f]);
                return n;
              });
              setSettings((s) => {
                const n = { ...s };
                ch.fields.forEach((f) => delete n[f.f]);
                return n;
              });
              setChannelStatus((s) => ({ ...s, [ch.key]: false }));
              setEditingChannel(null);
            }
          } else {
            setEditingChannel(null);
          }
        }}
        title={'配置 ' + (visibleChannels.find((c) => c.key === editingChannel)?.label || '')}
      >
        <div className="space-y-4">
          {editingChannel &&
            visibleChannels
              .find((c) => c.key === editingChannel)
              ?.fields.map((f) => (
                <div key={f.f}>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600">
                    {f.label}
                  </label>
                  <div className="relative">
                    <input
                      type={f.secret && !showSecret[f.f] ? 'password' : 'text'}
                      value={channelForm[f.f] || ''}
                      onChange={(e) =>
                        setChannelForm((s) => ({ ...s, [f.f]: e.target.value }))
                      }
                      className={INPUT_CLS}
                      placeholder={'请输入 ' + f.label}
                    />
                    {f.secret && (
                      <button
                        onClick={() =>
                          setShowSecret((s) => ({ ...s, [f.f]: !s[f.f] }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                      >
                        {showSecret[f.f] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}

          {/* 教程链接提示 */}
          {editingChannel && CHANNEL_TUTORIALS[editingChannel] && (
            <div className="flex items-center gap-2 rounded-xl bg-indigo-50/80 px-3 py-2 text-xs text-indigo-600">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span>
                {CHANNEL_TUTORIALS[editingChannel].desc}，{' '}
                <a
                  href={CHANNEL_TUTORIALS[editingChannel].url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-indigo-800"
                >
                  查看教程
                </a>
              </span>
            </div>
          )}

          {testResult && (
            <div
              className={`flex items-center gap-2 rounded-xl p-3 text-sm ${
                testResult.ok
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {testResult.ok ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {testResult.text}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleChannelSave}
              className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
            >
              确定
            </button>
            <button
              onClick={handleTest}
              disabled={testing || testCooldown > 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  测试中…
                </>
              ) : testCooldown > 0 ? (
                <>
                  <Clock className="h-4 w-4" />
                  {testCooldown}s 后可重试
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  测试
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      
{/* push picker modal */}
    </Modal>



      <Modal open={showPushPicker} onClose={() => setShowPushPicker(false)} title="选择推送内容" wide>
        <div className="space-y-5">
          {(() => {
            const categories = [...new Set(visiblePushOptions.map(o => o.category))];
            return categories.map(cat => {
              const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS['经营报表'];
              return (
                <div key={cat}>
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${colors.dot}`} />
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{cat}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {visiblePushOptions.filter(o => o.category === cat).map(o => {
                      const selected = !!settings[o.key];
                      return (
                        <button
                          key={o.key}
                          onClick={() => handleToggle(o.key)}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all ${
                            selected
                              ? colors.bg
                              : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600'
                          }`}
                        >
                          <div className={`h-1.5 w-1.5 rounded-full ${selected ? colors.dot : 'bg-slate-300'}`} />
                          {o.label}
                        </button>
);
                    })}
                  </div>
                </div>
              );
            });
          })()}
          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-xs text-slate-400">
              已选 {visiblePushOptions.filter(o => settings[o.key]).length} / {visiblePushOptions.length} 项
            </span>
            <button
              onClick={() => setShowPushPicker(false)}
              className="rounded-xl bg-indigo-500 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-600"
            >
              完成
            </button>
          </div>
        </div>
      </Modal>
    <ConfirmDialog />
    </>
  );
}
