export const ROLES = {
  ADMIN: 'ADMIN',
  STORE_ADMIN: 'STORE_ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
  SHAREHOLDER: 'SHAREHOLDER',
} as const;

export function isAdmin(role: string) {
  return role?.toUpperCase() === 'ADMIN';
}

export function isStoreAdmin(role: string) {
  return ['ADMIN', 'STORE_ADMIN'].includes(role?.toUpperCase());
}

export function isManagerOrAbove(role: string) {
  return ['ADMIN', 'STORE_ADMIN', 'MANAGER'].includes(role?.toUpperCase());
}

export function isReadonly(role: string) {
  return ['STAFF', 'SHAREHOLDER'].includes(role?.toUpperCase());
}
