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
  return ['SHAREHOLDER'].includes(role?.toUpperCase());
}

/**
 * 返回基于角色的记账条目过滤 SQL 子句
 * 当前所有角色均可查看所有条目，返回空字符串
 */
export function entryFilterClause(_role) {
  return '';
}
