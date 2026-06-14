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
      throw new Error(d.message || '登录失败');
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
    try {
      const d = await api.get('/auth/me');
      if (d.user) { set({ user: d.user, token: tk, loading: false }); }
      else { localStorage.removeItem('token'); set({ user: null, token: null, loading: false }); }
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },
}));