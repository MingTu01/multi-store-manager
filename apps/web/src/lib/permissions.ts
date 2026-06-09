export type Role = 'ADMIN' | 'MANAGER' | 'STAFF' | 'SHAREHOLDER';

const p: Record<string, Role[]> = {
  dashboard: ['ADMIN'],
  stores: ['ADMIN'],
  notifications: ['ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  upgrade: ['ADMIN'],
  password: ['ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  adminSettings: ['ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  storeOverview: ['ADMIN', 'MANAGER', 'STAFF'],
  storeEntries: ['ADMIN', 'MANAGER', 'STAFF'],
  storeInventory: ['ADMIN', 'MANAGER', 'STAFF'],
  storeShifts: ['ADMIN', 'MANAGER', 'STAFF'],
  storePayroll: ['ADMIN', 'MANAGER'],
  storeDividends: ['ADMIN', 'SHAREHOLDER'],
  storeStaff: ['ADMIN', 'MANAGER'],
  storeReport: ['ADMIN', 'SHAREHOLDER', 'MANAGER'],
  storeLogs: ['ADMIN', 'MANAGER'],
  storeSettings: ['ADMIN', 'MANAGER'],
};

export function canAccess(key: string, role?: Role): boolean {
  if (!role) return false;
  const allowed = p[key];
  if (!allowed) return true;
  return allowed.includes(role);
}

export function isMobile(): boolean {
  return window.innerWidth < 1024;
}
