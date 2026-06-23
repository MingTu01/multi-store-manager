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

/** 财务数据可见性过滤
 *  ADMIN/STORE_ADMIN/SHAREHOLDER → 全部可见
 *  MANAGER → 可见工资，不可见分红
 *  STAFF → 不可见工资和分红（is_system=1的条目全部隐藏）
 */
export function entryFilterClause(role: string, alias?: string): string {
  const p = alias ? alias + '.' : '';
  if (isAdmin(role) || isStoreAdmin(role) || isReadonly(role)) return '';
  if (role?.toUpperCase() === 'MANAGER') return " AND NOT (" + p + "is_system = 1 AND " + p + "category = '分红')";
  return " AND (" + p + "is_system = 0 OR " + p + "is_system IS NULL)";
}
