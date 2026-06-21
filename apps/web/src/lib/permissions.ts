export type Role = 'ADMIN' | 'STORE_ADMIN' | 'MANAGER' | 'STAFF' | 'SHAREHOLDER';

const p: Record<string, Role[]> = {
  dashboard: ['ADMIN'],
  stores: ['ADMIN'],
  notifications: ['ADMIN', 'STORE_ADMIN'],
  upgrade: ['ADMIN'],
  password: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  adminSettings: ['ADMIN'],
  storeOverview: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeEntries: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeInventory: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeShifts: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storePayroll: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'SHAREHOLDER'],
  storeDividends: ['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER'],
  storeStaff: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeReport: ['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER', 'MANAGER'],
  storeLogs: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'SHAREHOLDER'],
  storeAccount: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeSettings: ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeNotifications: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeAdmin: ['ADMIN', 'STORE_ADMIN'],
  storeAdminSettings: ['ADMIN', 'STORE_ADMIN'],
  storeNotificationSettings: ['ADMIN', 'STORE_ADMIN'],
  storePurchase: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'SHAREHOLDER'],
};

export type PermissionKey = string;

export function canAccess(key: PermissionKey, role?: Role): boolean {
  if (!role) return false;
  const allowed = p[key];
  if (!allowed) return false;
  return allowed.includes(role);
}