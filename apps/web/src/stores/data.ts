import { create } from 'zustand';
import { api } from '../lib/api';

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
  token: localStorage.getItem('token'),
  loading: true,
  login: async (username: string, password: string) => {
    const d = await api.post('/auth/login', { username, password });
    if (d.token) {
      localStorage.setItem('token', d.token);
      set({ token: d.token, user: d.user, loading: false });
    } else {
      throw new Error(d.message || '\u767b\u5f55\u5931\u8d25');
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null, loading: false });
    window.location.href = '/login';
  },
    restore: async () => {
    const tk = localStorage.getItem('token');
    if (!tk) { set({ loading: false }); return; }
    // Use raw fetch to avoid api.parseError auto-clearing token on 401
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: 'Bearer ' + tk },
          cache: 'no-cache'
        });
        if (!res.ok) {
          // Definite 401 — token is invalid
          localStorage.removeItem('token');
          set({ user: null, token: null, loading: false });
          return;
        }
        const d = await res.json();
        if (d.user) { set({ user: d.user, token: tk, loading: false }); return; }
        localStorage.removeItem('token');
        set({ user: null, token: null, loading: false });
        return;
      } catch (e: any) {
        // Network error — retry
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        // All retries failed — keep token, just stop loading
        set({ loading: false });
      }
    }
  },
}));
