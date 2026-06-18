import { create } from 'zustand';
import { api } from '../lib/api';

interface NotificationState {
  unreadCount: number;
  fetchUnread: () => Promise<void>;
  decrementUnread: (n?: number) => void;
  resetUnread: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadCount: 0,
  fetchUnread: async () => {
    try {
      const d = await api.get('/notifications/unread-count', { silent: true });
      set({ unreadCount: d.count || 0 });
    } catch {}
  },
  decrementUnread: (n = 1) => {
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - n) }));
  },
  resetUnread: () => set({ unreadCount: 0 }),
}));
