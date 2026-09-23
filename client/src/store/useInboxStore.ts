import { create } from 'zustand';
import { api } from '../services/api.js';

/** Header badge counts, kept live by realtime events. */
interface InboxState {
  unreadNotifications: number;
  unreadMessages: number;
  online: Record<string, boolean>;
  refreshCounts: () => Promise<void>;
  setUnreadNotifications: (n: number) => void;
  setUnreadMessages: (n: number) => void;
  setOnline: (userId: string, online: boolean) => void;
}

export const useInboxStore = create<InboxState>((set) => ({
  unreadNotifications: 0,
  unreadMessages: 0,
  online: {},
  refreshCounts: async () => {
    try {
      const res = await api.getCounts();
      set({ unreadNotifications: res.notifications, unreadMessages: res.messages });
    } catch {
      /* ignore */
    }
  },
  setUnreadNotifications: (n) => set({ unreadNotifications: Math.max(0, n) }),
  setUnreadMessages: (n) => set({ unreadMessages: Math.max(0, n) }),
  setOnline: (userId, online) => set((s) => ({ online: { ...s.online, [userId]: online } })),
}));
