
---

## 阶段 17（补充）：前端权限修复 [StoreGuard + StoreDividendsPage]

> 原则：不改变 UI 排版和操作逻辑，只在权限控制层面做补强

### 修复 1：StoreGuard.tsx — 增加角色权限守卫

**文件**：`apps/web/src/components/StoreGuard.tsx`

**目的**：防止通过直接输入 URL 绕过 Sidebar 的权限过滤

**修改方式**：在现有 `if (!isOpen)` 判断之前，增加角色权限检查。不改变任何 UI 样式和交互逻辑。

在文件顶部增加导入：
```typescript
import { useLocation } from 'react-router-dom';
import { canAccess } from '../lib/permissions';
```

在组件内部，`useEffect` 之后、`if (!isOpen)` 之前，增加路径到权限 key 的映射和检查：

```typescript
const location = useLocation();

// 根据路径判断所需权限
const path = location.pathname;
const permMap: [string, string][] = [
  ['/entries', 'storeEntries'],
  ['/inventory', 'storeInventory'],
  ['/shifts', 'storeShifts'],
  ['/payroll', 'storePayroll'],
  ['/dividends', 'storeDividends'],
  ['/staff', 'storeStaff'],
  ['/report', 'storeReport'],
  ['/logs', 'storeLogs'],
  ['/settings', 'storeSettings'],
  ['/account', 'storeAccount'],
];
let permKey = 'storeOverview';
for (const [suffix, key] of permMap) {
  if (path.endsWith(suffix)) { permKey = key; break; }
}

// 权限不足时重定向到首页
if (user && !canAccess(permKey, user.role)) {
  return <Navigate to="/" replace />;
}
```

**影响分析**：
- 不改变任何 UI 样式、布局、按钮位置
- 不改变任何操作流程
- 仅在无权限用户通过 URL 直接访问时，重定向到首页
- 合法用户（通过 Sidebar 点击进入）完全不受影响，因为 Sidebar 已经过滤了无权限链接

---

### 修复 2：StoreDividendsPage.tsx — SHAREHOLDER 只能查看不能操作

**文件**：`apps/web/src/pages/store/StoreDividendsPage.tsx`

**目的**：SHAREHOLDER 角色只能查看分红记录，不能创建/编辑/删除/归档

**修改方式**：在组件内部获取当前用户角色，用 `canManage` 控制按钮可见性。

在组件顶部增加：
```typescript
import { useStore } from '../../stores/data';

// 在组件函数内部：
const myRole = useStore((s) => s.user?.role);
const canManage = myRole === 'ADMIN';
```

然后将以下按钮用 `{canManage && (...)}` 包裹：
1. 页面标题旁的"创建分红"桌面端按钮
2. 分红列表项中的删除/编辑/归档按钮（整个操作区域）
3. 底部的 FloatingActionButton（移动端创建按钮）

具体修改：
```typescript
// 桌面端"创建分红"按钮
{canManage && (
  <button onClick={() => setShowCreate(true)} className="hidden lg:inline-flex ...">
    <Plus .../>创建分红
  </button>
)}

// 列表中的操作按钮（编辑/删除/归档）
{d.status !== 'archived' && canManage && (
  <div className="flex gap-1">
    <button ...删除</button>
    <button ...编辑</button>
    <button ...归档</button>
  </div>
)}

// 移动端浮动按钮
{canManage && <FloatingActionButton label="创建分红" ... />}
```

**影响分析**：
- 不改变 UI 排版、颜色、字体、间距
- 不改变分红列表的展示方式
- 不改变点击分红记录查看详情的操作逻辑
- ADMIN 看到的界面和操作**完全不变**
- SHAREHOLDER 只是看不到操作按钮，仍可正常查看分红列表和详情
- 创建分红弹窗（Modal）的代码保留不删除，因为 ADMIN 仍需要它

---

## 前端修复验证清单

### 安全验证（应全部拒绝）
| 场景 | 预期结果 |
|------|----------|
| SHAREHOLDER 直接访问 /store/:id/entries | 重定向到首页 |
| SHAREHOLDER 直接访问 /store/:id/payroll | 重定向到首页 |
| SHAREHOLDER 直接访问 /store/:id/staff | 重定向到首页 |
| STAFF 直接访问 /store/:id/payroll | 重定向到首页 |
| STAFF 直接访问 /store/:id/dividends | 重定向到首页 |

### 功能验证（应全部不变）
| 场景 | 预期结果 |
|------|----------|
| ADMIN 查看分红页面 | 看到创建/编辑/删除/归档按钮 |
| SHAREHOLDER 查看分红页面 | 只看到分红列表和详情，无操作按钮 |
| ADMIN 通过 Sidebar 进入记账页面 | 完全正常 |
| STAFF 通过 Sidebar 进入记账页面 | 完全正常 |
| SHAREHOLDER 通过 Sidebar 看到的菜单 | 只有分红、报表、通知、账户、密码 |
