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
      const url = '/notifications/unread-count?t=' + Date.now();
      const d = await api.get(url, { silent: true });
      const newCount = d.count || 0;

      set({ unreadCount: newCount });
    } catch (e: any) {

    }
  },
  decrementUnread: (n = 1) => {
    set((s) => ({ unreadCount: Math.max(0, s.unreadCount - n) }));
  },
  resetUnread: () => set({ unreadCount: 0 }),
}));