import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';
import { isNativeApp } from '../lib/config';

export function BrowserPushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isNativeApp()) {
      // Native app: use Capacitor PushNotifications
      initCapacitorPush();
    } else {
      // Browser: use Web Push API
      initBrowserPush();
    }
  }, []);

  const initCapacitorPush = async () => {
    try {
      if (localStorage.getItem('msl_push_dismissed')) return;
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'granted') {
        await registerToken();
        return;
      }
      if (perm.receive === 'denied') return;
      setTimeout(() => setShow(true), 2000);
    } catch {
      // Plugin not available
    }
  };

  const initBrowserPush = () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (localStorage.getItem('msl_push_dismissed')) return;
    if (Notification.permission === 'denied') return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) return;
      setTimeout(() => setShow(true), 2000);
    }).catch(() => {});
  };

  const registerToken = async () => {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.register();
      const tokenHandler = await new Promise<string>((resolve) => {
        const handler = (token: any) => {
          PushNotifications.removeListener('registration', handler);
          resolve(token.value);
        };
        PushNotifications.addListener('registration', handler);
        setTimeout(() => {
          PushNotifications.removeListener('registration', handler);
          resolve('');
        }, 15000);
      });
      if (tokenHandler) {
        await api.post('/system/push/capacitor-token', { token: tokenHandler, platform: 'android' });
      }
    } catch {
      // silent fail
    }
  };

  const handleEnable = async () => {
    setShow(false);
    localStorage.setItem('msl_push_dismissed', '1');

    if (isNativeApp()) {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive === 'granted') {
          await registerToken();
        }
      } catch {
        // silent fail
      }
      return;
    }

    // Browser path
    try {
      if (Notification.permission !== 'granted') {
        const result = await Notification.requestPermission();
        if (result !== 'granted') return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidRes = await api.get('/system/push/vapid-key') as any;
      const vapidKey = vapidRes.publicKey;
      const base64 = vapidKey.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
      const raw = atob(padded);
      const appKey = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i);
      let sub = null;
      try {
        sub = await Promise.race([
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey }),
          new Promise((r) => setTimeout(() => r(null), 10000))
        ]);
      } catch {}
      if (!sub) {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 500));
          sub = await reg.pushManager.getSubscription();
          if (sub) break;
        }
      }
      if (sub) {
        const subJson = sub.toJSON();
        await api.post('/system/push/subscribe', { endpoint: subJson.endpoint, keys: subJson.keys });
      }
    } catch {
      // silent fail
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('msl_push_dismissed', '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100">
            <Bell className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">开启推送通知</h3>
            <p className="text-xs text-slate-400">及时接收门店重要消息</p>
          </div>
        </div>
        <p className="mb-5 text-sm text-slate-600">
          开启后将收到工资发放、健康证到期、每日简报等重要提醒。
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200"
          >
            暂不开启
          </button>
          <button
            onClick={handleEnable}
            className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600"
          >
            立即开启
          </button>
        </div>
      </div>
    </div>
  );
}
