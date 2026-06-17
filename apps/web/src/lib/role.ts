// 角色标签和颜色配置 - 全局统一
export const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ADMIN:        { label: '系统管理员', color: 'text-amber-700', bg: 'bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300' },
  STORE_ADMIN:  { label: '店铺管理员', color: 'text-sky-700',    bg: 'bg-sky-50' },
  MANAGER:      { label: '店长',       color: 'text-emerald-700', bg: 'bg-emerald-50' },
  STAFF:        { label: '员工',       color: 'text-slate-600',  bg: 'bg-slate-100' },
  SHAREHOLDER:  { label: '股东',       color: 'text-violet-700', bg: 'bg-violet-50' },
};

export function getRoleLabel(role?: string): string {
  return ROLE_CONFIG[role || '']?.label || role || '';
}

export function getRoleColor(role?: string): string {
  return ROLE_CONFIG[role || '']?.color || 'text-slate-600';
}

export function getRoleBg(role?: string): string {
  return ROLE_CONFIG[role || '']?.bg || 'bg-slate-100';
}
