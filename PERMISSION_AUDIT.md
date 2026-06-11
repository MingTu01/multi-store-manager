# 前端角色权限审查结果

> 审查时间：2026-06-11
> 审查范围：前端所有页面、导航、按钮的角色权限控制

---

## 一、导航层（Sidebar + BottomNav）

| 位置 | 机制 | 状态 |
|------|------|------|
| Sidebar.tsx | `currentNav.filter(n => canAccess(n.key, role))` | 正确 — 无权限项不可见 |
| BottomNav.tsx | `allTabs.filter(t => canAccess(t.key, role))` + `storeMoreTabs.filter(...)` | 正确 — 无权限项不可见 |

结论：导航菜单的权限过滤**完全正确**，无权限的菜单项不会渲染。

---

## 二、路由层（App.tsx）

| 路由 | 守卫机制 | 问题 |
|------|----------|------|
| `/` (dashboard) | `<Guard perm="dashboard">` | 正确 |
| `/stores` | `<Guard perm="stores">` | 正确 |
| `/notifications` | 无 Guard | OK — 所有角色都有权限 |
| `/upgrade` | `<Guard perm="upgrade">` | 正确 |
| `/password` | 无 Guard | OK — 所有角色都有权限 |
| `/admin-settings` | 无 Guard | OK — 所有角色都有权限 |
| `/store/:storeId/*` (全部子路由) | 仅 `<StoreGuard>` | **问题** |

**关键发现：StoreGuard 不检查角色权限**

StoreGuard.tsx 只检查门店是否开门（`is_open`），**不检查用户角色是否有权限访问该页面**。

这意味着：
- SHAREHOLDER 如果手动输入 URL `/store/:storeId/entries`，可以进入记账页面（Sidebar 已隐藏该链接）
- STAFF 如果手动输入 URL `/store/:storeId/payroll`，可以进入工资页面
- SHAREHOLDER 如果手动输入 URL `/store/:storeId/staff`，可以进入员工页面

虽然 Sidebar 隐藏了链接，但路由本身没有守卫。通过直接输入 URL 可以绕过。

---

## 三、页面内按钮权限控制

### StoreStaffPage（员工管理）— 正确
```javascript
const canEdit = myRole === 'ADMIN' || myRole === 'MANAGER';
// "添加员工" 按钮: {canEdit && (<button>...)}
// 编辑/删除按钮: {canEdit && !shareholder && (<div>...)}
// FloatingActionButton: {canEdit && <FAB .../>}
```
按钮级权限控制**完全正确**。

### StoreEntriesPage（记账）— 无按钮级控制
- "记一笔" 按钮、编辑、删除按钮：**所有能访问该页面的角色都可见**
- 实际影响：页面权限为 ADMIN/MANAGER/STAFF，三者都有记账权限，**功能上合理**

### StorePayrollPage（工资）— 无按钮级控制
- "生成工资" 按钮、删除、发放按钮：**所有能访问该页面的角色都可见**
- 页面权限为 ADMIN/MANAGER，两者都有工资管理权限，**功能上合理**

### StoreDividendsPage（分红）— **有问题**
- "创建分红" 按钮、编辑、删除、归档按钮：**所有能访问该页面的角色都可见**
- 页面权限为 ADMIN + SHAREHOLDER
- **问题：SHAREHOLDER 应该只能查看分红，不应该看到创建/编辑/删除/归档按钮**

### StoreInventoryPage（盘点）— 无按钮级控制
- 添加物品、编辑、删除、开始盘点按钮：**所有能访问该页面的角色都可见**
- 页面权限为 ADMIN/MANAGER/STAFF，三者都有盘点权限，**功能上合理**

### StoreSettingsPage（门店设置）— 无按钮级控制
- 分类添加、编辑、删除按钮：**所有能访问该页面的角色都可见**
- 页面权限为 ADMIN/MANAGER，两者都有设置权限，**功能上合理**

---

## 四、问题汇总

| 严重程度 | 问题 | 位置 | 说明 |
|----------|------|------|------|
| 高 | StoreGuard 不检查角色权限 | StoreGuard.tsx / App.tsx | 通过直接输入 URL 可绕过 Sidebar 的权限过滤，访问无权限的门店子页面 |
| 中 | 分红页面按钮无角色检查 | StoreDividendsPage.tsx | SHAREHOLDER 可以看到并操作创建/编辑/删除/归档按钮 |

---

## 五、修复建议

### 修复 1：StoreGuard 增加角色权限检查

在 StoreGuard.tsx 中，进入页面前检查 `canAccess`：

```typescript
// 在 StoreGuard 中增加：
import { canAccess } from '../lib/permissions';

// 根据当前路径判断需要的权限 key
const path = location.pathname;
let permKey = 'storeOverview';
if (path.endsWith('/entries')) permKey = 'storeEntries';
else if (path.endsWith('/inventory')) permKey = 'storeInventory';
else if (path.endsWith('/shifts')) permKey = 'storeShifts';
else if (path.endsWith('/payroll')) permKey = 'storePayroll';
else if (path.endsWith('/dividends')) permKey = 'storeDividends';
else if (path.endsWith('/staff')) permKey = 'storeStaff';
else if (path.endsWith('/report')) permKey = 'storeReport';
else if (path.endsWith('/logs')) permKey = 'storeLogs';
else if (path.endsWith('/settings')) permKey = 'storeSettings';
else if (path.endsWith('/account')) permKey = 'storeAccount';

if (!canAccess(permKey, user?.role)) {
  return <Navigate to="/" replace />;
}
```

### 修复 2：StoreDividendsPage 按钮加角色检查

```typescript
const myRole = useStore((s) => s.user?.role);
const canManage = myRole === 'ADMIN'; // 只有 ADMIN 可以管理分红

// "创建分红" 按钮: {canManage && (<button>...)}
// 编辑/删除/归档按钮: {canManage && (<div>...)}
```

---

## 六、总结

| 检查项 | 状态 |
|--------|------|
| 导航菜单权限过滤 | 正确 |
| 页面路由守卫（顶层 Guard） | 正确 |
| 门店子路由守卫（StoreGuard） | **缺少角色检查** |
| 员工页面按钮权限 | 正确 |
| 分红页面按钮权限 | **缺少角色检查** |
| 其他页面按钮权限 | 功能合理（能访问的角色都有对应权限） |
