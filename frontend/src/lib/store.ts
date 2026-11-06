import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
  read: boolean;
}

export type SyncState = 'idle' | 'syncing' | 'error' | 'offline';

interface AppState {
  // Notifications
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  clearNotifications: () => void;
  unreadCount: () => number;

  // Command palette
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // App settings
  autoRefresh: boolean;
  setAutoRefresh: (v: boolean) => void;
  refreshInterval: number;
  setRefreshInterval: (v: number) => void;
  lowStockThreshold: number;
  setLowStockThreshold: (v: number) => void;
  // Sync state (driven by src/lib/sync.ts; consumed by SyncStatus component)
  syncState: SyncState;
  lastSync: string | null;
  syncError: string | null;
  outboxCount: number;
  setSyncState: (s: SyncState) => void;
  setSyncError: (err: string | null) => void;
  setLastSync: (t: string) => void;
  setOutboxCount: (n: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      notifications: [],
      addNotification: (n) =>
        set((state) => ({
          notifications: [
            {
              ...n,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              read: false,
            },
            ...state.notifications.slice(0, 49),
          ],
        })),
      markRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      clearNotifications: () => set({ notifications: [] }),
      unreadCount: () => get().notifications.filter((n) => !n.read).length,

      commandPaletteOpen: false,
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      autoRefresh: true,
      setAutoRefresh: (v) => set({ autoRefresh: v }),
      refreshInterval: 30,
      setRefreshInterval: (v) => set({ refreshInterval: v }),
      lowStockThreshold: 10,
      setLowStockThreshold: (v) => set({ lowStockThreshold: v }),
      // Sync state defaults
      syncState: 'idle',
      lastSync: null,
      syncError: null,
      outboxCount: 0,
      setSyncState: (s) => set({ syncState: s }),
      setSyncError: (err) => set({ syncError: err }),
      setLastSync: (t) => set({ lastSync: t }),
      setOutboxCount: (n) => set({ outboxCount: n }),
    }),
    {
      name: 'vortex-app-store',
      partialize: (state) => ({
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
        lowStockThreshold: state.lowStockThreshold,
      }),
    }
  )
);
