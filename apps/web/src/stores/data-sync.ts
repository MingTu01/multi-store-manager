import { create } from 'zustand';

interface DataSyncState {
  version: number;
  storeVersions: Record<string, number>;
  notificationVersion: number;
  bumpGlobal: () => void;
  bumpStore: (storeId: string) => void;
  bumpNotifications: () => void;
}

export const useDataSync = create<DataSyncState>((set) => ({
  version: 0,
  storeVersions: {},
  notificationVersion: 0,
  bumpGlobal: () => set((s) => ({ version: s.version + 1 })),
  bumpStore: (storeId: string) => set((s) => ({
    storeVersions: { ...s.storeVersions, [storeId]: (s.storeVersions[storeId] || 0) + 1 },
  })),
  bumpNotifications: () => set((s) => ({ notificationVersion: s.notificationVersion + 1 })),
}));

export function useDataVersion(scope: 'global' | 'store' | 'notifications', storeId?: string): number {
  const v = useDataSync((s) => s.version);
  const sv = useDataSync((s) => storeId ? (s.storeVersions[storeId] || 0) : 0);
  const nv = useDataSync((s) => s.notificationVersion);
  if (scope === 'notifications') return nv;
  if (scope === 'store') return sv;
  return v;
}
