import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useStore } from '../stores/data';
import { Modal } from './Modal';
import { GlassCard } from './GlassCard';
import {
  Send, Check, Edit2, Eye, EyeOff, Loader2, AlertCircle,
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
    key: 'serverchan',
    label: 'Server酱',
    fields: [{ f: 'serverchan_key', label: 'Key', secret: true }],
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
  serverchan: { url: 'https://sct.ftqq.com/forward', desc: '微信扫码登录获取SendKey' },
  wecom: { url: 'https://developer.work.weixin.qq.com/document/path/90236', desc: '创建自建应用获取配置' },
  iyuu: { url: 'https://iyuu.cn/', desc: '关注公众号获取Token' },
};

interface PushOption {
  key: string;
  label: string;
  roles: string[];
}

const PUSH_OPTIONS: PushOption[] = [
  // 管理员 / 店铺管理员
  { key: 'push_daily_report', label: '每日简报', roles: ['ADMIN', 'STORE_ADMIN'] },
  { key: 'push_weekly_report', label: '每周报告', roles: ['ADMIN', 'STORE_ADMIN'] },
  { key: 'push_monthly_report', label: '月度报告', roles: ['ADMIN', 'STORE_ADMIN'] },
  { key: 'push_review_reminder', label: '审核提醒', roles: ['ADMIN', 'STORE_ADMIN'] },
  { key: 'push_alert', label: '异常警告', roles: ['ADMIN', 'STORE_ADMIN'] },
  // 店长
  { key: 'push_bookkeeping_notify', label: '记账通知', roles: ['MANAGER'] },
  { key: 'push_inventory_notify', label: '盘点通知', roles: ['MANAGER'] },
  { key: 'push_openclose_notify', label: '开闭店通知', roles: ['MANAGER'] },
  { key: 'push_purchase_notify', label: '进货通知', roles: ['MANAGER'] },
  // 员工
  { key: 'push_salary_notify', label: '工资通知', roles: ['STAFF'] },
  // 股东
  { key: 'push_dividend_notify', label: '分红通知', roles: ['SHAREHOLDER'] },
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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ---- PWA 浏览器推送通知状态 ---- */
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [isIOS, setIsIOS] = useState(false);

  /* ---- 可见渠道 & 推送选项 ---- */
  const visibleChannels = CHANNELS.filter(
    (ch) => !ch.adminOnly || role === 'ADMIN',
  );
  const visiblePushOptions = PUSH_OPTIONS.filter((o) => o.roles.includes(role));

  /* ---- 提示 ---- */
  const showMsg = useCallback((ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 4000);
  }, []);

  /* ---- 检查浏览器推送通知权限 ---- */
  useEffect(() => {
    if (!open) return;
    // 检测 iOS
    const ua = navigator.userAgent || '';
    setIsIOS(/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    // 检查 Notification API 是否可用
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
    }
  }, [open]);

  /* ---- 请求浏览器推送通知权限并订阅 ---- */
  const handleRequestNotifPermission = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const vapidRes = await api.get('/system/push/vapid-key') as any;
        const vapidKey = vapidRes.publicKey;
        const applicationServerKey = Uint8Array.from(atob(vapidKey), c => c.charCodeAt(0));
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
        const subJson = sub.toJSON();
        await api.post('/system/push/subscribe', { endpoint: subJson.endpoint, keys: subJson.keys });
        showMsg(true, '浏览器推送已开启');
      }
    } catch (e: any) {
      showMsg(false, '开启推送失败: ' + (e.message || '未知错误'));
    }
  };

  /* ---- 加载设置 ---- */
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setEditingChannel(null);
    setTestResult(null);
    setTestCooldown(0);
    setMsg(null);
    api
      .get('/system/user-notification-settings')
      .then((d: any) => {
        setSettings(d);
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
  };

  /* ---- 渠道表单中保存配置到本地 ---- */
  const handleChannelSave = () => {
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
        setChannelStatus((s) => ({ ...s, [editingChannel!]: true }));
        setTestResult({
          ok: true,
          text: '测试成功，' + res.results.join('+') + ' 推送已发送。',
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
    <Modal open={open} onClose={onClose} title="推送设置" wide>
      <div className="space-y-5">
        {/* 全局提示 */}
        {msg && (
          <div
            className={`rounded-xl px-4 py-3 text-sm backdrop-blur-sm ${
              msg.ok
                ? 'bg-emerald-100/80 text-emerald-700'
                : 'bg-red-100/80 text-red-700'
            }`}
          >
            {msg.text}
          </div>
        )}

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
                      {notifPermission === 'granted'
                        ? '已开启'
                        : notifPermission === 'denied'
                        ? '已拒绝，请到浏览器设置中开启通知权限'
                        : '未开启'}
                    </div>
                  </div>
                </div>
                {notifPermission === 'granted' ? (
                  <button
                    onClick={async () => {
                      try {
                        await api.post('/system/push/test');
                        showMsg(true, '测试推送已发送');
                      } catch { showMsg(false, '发送失败'); }
                    }}
                    className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-100"
                  >
                    测试推送
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
            </GlassCard>

            {/* ===== 推送内容 ===== */}
            {visiblePushOptions.length > 0 && (
              <GlassCard className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Bell className="h-4 w-4 text-indigo-500" />
                  推送内容
                </h3>
                <div className="space-y-2">
                  {visiblePushOptions.map((opt) => (
                    <label
                      key={opt.key}
                      className="flex cursor-pointer items-center justify-between rounded-xl bg-white/40 p-3 transition-all hover:bg-white/60"
                    >
                      <span className="text-sm text-slate-700">{opt.label}</span>
                      <div
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          settings[opt.key] ? 'bg-indigo-500' : 'bg-slate-300'
                        }`}
                        onClick={() => handleToggle(opt.key)}
                      >
                        <div
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${
                            settings[opt.key] ? 'translate-x-5' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </label>
                  ))}
                </div>
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
        onClose={() => setEditingChannel(null)}
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
    </Modal>
  );
}