export type Role = 'ADMIN' | 'STORE_ADMIN' | 'MANAGER' | 'STAFF' | 'SHAREHOLDER';

const p: Record<string, Role[]> = {
  dashboard: ['ADMIN'],
  stores: ['ADMIN'],
  notifications: ['ADMIN', 'STORE_ADMIN'],
  upgrade: ['ADMIN'],
  password: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  adminSettings: ['ADMIN'],
  storeOverview: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'],
  storeEntries: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'],
  storeInventory: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'],
  storeShifts: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF'],
  storePayroll: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeDividends: ['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER'],
  storeStaff: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeReport: ['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER', 'MANAGER'],
  storeLogs: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeAccount: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeSettings: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeNotifications: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeAdmin: ['ADMIN', 'STORE_ADMIN'],
  storeAdminSettings: ['ADMIN', 'STORE_ADMIN'],
  storeNotificationSettings: ['ADMIN', 'STORE_ADMIN'],
};

export function canAccess(key: string, role?: Role): boolean {
  if (!role) return false;
  const allowed = p[key];
  if (!allowed) return false;
  return allowed.includes(role);
}