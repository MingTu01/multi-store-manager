import { create } from 'zustand';
import { api, invalidateCache, resetRedirectFlag } from '../lib/api';
import { useDataSync } from './data-sync';
import { useNotificationStore } from './notification';
import { disconnectSSE, reconnectSSE } from '../lib/sse';

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
      reconnectSSE();
      const d = await api.post('/auth/login', { username, password });
      if (d.user) {
        set({ token: 'cookie', user: d.user, loading: false });
      }
    } catch (e: any) {
      throw new Error(e.message || '用户名或密码错误');
    }
  },
  logout: () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    set({ token: null, user: null, loading: false });
    useNotificationStore.getState().resetUnread();
    disconnectSSE();
    invalidateCache();
    window.location.replace('/login');
  },
  restore: async () => {
    // 尝试通过 API 调用验证会话（cookie 自动携带）
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) {
          set({ user: null, token: null, loading: false });
          return;
        }
        const d = await res.json();
        if (d.user) {
          set({ user: d.user, token: 'cookie', loading: false });
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
