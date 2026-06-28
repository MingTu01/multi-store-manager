import { create } from 'zustand';
import { api, invalidateCache, resetRedirectFlag } from '../lib/api';
import { useDataSync } from './data-sync';
import { useNotificationStore } from './notification';
import { disconnectSSE, reconnectSSE } from '../lib/sse';
import { getBaseURL } from '../lib/config';

export interface User {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'STORE_ADMIN' | 'MANAGER' | 'STAFF' | 'SHAREHOLDER';
  store_id?: number | null;
  store_name?: string;
  phone?: string;
  avatar?: string;
  address?: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  token: null,
  loading: true,
  login: async (username: string, password: string) => {
    try {
      invalidateCache();
      resetRedirectFlag();
      const d = await api.post('/auth/login', { username, password });
      if (d.user) {
        set({ token: 'cookie', user: d.user, loading: false });
        reconnectSSE();
      }
    } catch (e: any) {
      throw new Error(e.message || '用户名或密码错误');
    }
  },
  logout: () => {
    // Unsubscribe from browser push before logout
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready.then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          fetch(getBaseURL() + '/api/system/push/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ endpoint: sub.endpoint })
          }).catch(() => {});
          await sub.unsubscribe().catch(() => {});
        }
      }).catch(() => {});
    }
    fetch(getBaseURL() + '/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    set({ token: null, user: null, loading: false });
    useNotificationStore.getState().resetUnread();
    disconnectSSE();
    invalidateCache();
    window.location.replace('/login');
  },
  restore: async () => {
    // Skip if already on login page
    if (typeof window !== 'undefined' && window.location.pathname === '/login') {
      set({ user: null, token: null, loading: false });
      return;
    }
    // 尝试通过 API 调用验证会话（cookie 自动携带）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        let res: Response;
        try {
          res = await fetch(getBaseURL() + '/api/auth/me', {
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal
          });
        } catch (_) {
          res = new Response(null, { status: 0 });
        }
        clearTimeout(timer);
        if (!res.ok) {
          set({ user: null, token: null, loading: false });
          return;
        }
        const d = await res.json();
        if (d.user) {
          resetRedirectFlag();
          set({ user: d.user || null, token: 'cookie', loading: false });
          return;
        }
        set({ user: null, token: null, loading: false });
        return;
      } catch (e: any) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        set({ loading: false });
      }
    }
    // Safety net: always clear loading
    set({ loading: false });
  },
}));
