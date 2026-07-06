# 经营日历功能 — 收尾执行计划 v2.2.0

## 一、当前状态摘要

经搜索 agent 全面验证：

| 模块 | 完成度 | 状态 |
|------|--------|------|
| 后端 — 数据库表 + 索引 | 100% | `staff_rest_schedules` / `staff_handovers` 两表 + 4 索引就位 |
| 后端 — 路由文件 | 100% | `rest-schedules.ts` / `calendar.ts` / `store-calendar.ts` / `handovers.ts`(扩展) 全部就位 |
| 后端 — app.ts 路由挂载 | 100% | 3 条新 use 已挂载 |
| 前端 — 组件文件 | 100% | `Calendar.tsx` / `RestScheduleModal.tsx` 已建 |
| 前端 — 页面文件 | 100% | 4 个页面（admin 月+日 / store 月+日）已建 |
| **前端 — 集成（路由/权限/导航/守卫）** | **0%** | **本计划的核心** |
| 版本号同步 | 0% | version.json=2.0.5 / package.json=2.1.4，均需升 2.2.0 |

结论：用户当前**完全无法访问**日历功能 — 5 处前端集成缺失。本计划只做收尾。

---

## 二、剩余工作清单（共 7 步）

### 步骤 1：新增 storeCalendar 权限点

**文件**: [permissions.ts](file:///workspace/apps/web/src/lib/permissions.ts)

**修改**: 在 `p` 映射表的最后一项 `storePurchase: [...]` 后追加一行：

```ts
storeCalendar: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
```

**理由**: 所有角色均可访问日历（按角色区分看到的内容，由后端 /stores/:storeId/calendar/daily 返回的 can_* 标记控制）。

---

### 步骤 2：App.tsx 新增 4 个 import + 4 条懒加载路由

**文件**: [App.tsx](file:///workspace/apps/web/src/App.tsx)

**修改 A** — 在第 31 行 `StoreNotificationsPage` 之后新增 4 个 lazy import：

```ts
const CalendarPage = lazy(() => import('./pages/dashboard/CalendarPage'));
const CalendarDetailPage = lazy(() => import('./pages/dashboard/CalendarDetailPage'));
const StoreCalendarPage = lazy(() => import('./pages/store/StoreCalendarPage'));
const StoreCalendarDetailPage = lazy(() => import('./pages/store/StoreCalendarDetailPage'));
```

**修改 B** — 在 admin 路由区（第 127 行 `admin-settings` 之后）插入 2 条管理端路由：

```tsx
<Route path="calendar" element={<Guard perm="dashboard"><CalendarPage /></Guard>} />
<Route path="calendar/:date" element={<Guard perm="dashboard"><CalendarDetailPage /></Guard>} />
```

> 管理端日历用 `dashboard` 权限（仅 ADMIN/STORE_ADMIN/MANAGER 可见总览）。

**修改 C** — 在 store 路由区（第 140 行 `settings` 之前）插入 2 条店铺端路由：

```tsx
<Route path="store/:storeId/calendar" element={<StoreGuard><StoreCalendarPage /></StoreGuard>} />
<Route path="store/:storeId/calendar/:date" element={<StoreGuard><StoreCalendarDetailPage /></StoreGuard>} />
```

> 店铺端用 StoreGuard 守卫，权限由 StoreGuard 内 permMap 走 storeCalendar（步骤 5）。

---

### 步骤 3：Sidebar.tsx 新增日历菜单项

**文件**: [Sidebar.tsx](file:///workspace/apps/web/src/layouts/Sidebar.tsx)

**修改 A** — import 中追加 `Calendar` 图标（来自 lucide-react）：

```ts
import { LayoutDashboard, Store, Bell, Settings, Package, BookOpen, Users, BarChart3, Clock, FileText, DollarSign, Divide, LogOut, ChevronRight, ArrowLeft, Truck, Calendar } from 'lucide-react';
```

**修改 B** — adminNav 数组在 `'门店管理'` 之后追加：

```ts
{ to: '/calendar', icon: Calendar, label: '经营日历', key: 'dashboard' },
```

> key 用 `dashboard`（与路由 Guard perm 一致）。

**修改 C** — storeNav 数组在 `'开闭店'` 之后追加：

```ts
{ to: '/store/' + storeId + '/calendar', icon: Calendar, label: '经营日历', key: 'storeCalendar' },
```

> key 用 `storeCalendar`（步骤 1 新增的权限点）。

---

### 步骤 4：BottomNav.tsx 新增日历项

**文件**: [BottomNav.tsx](file:///workspace/apps/web/src/layouts/BottomNav.tsx)

**修改 A** — import 追加 `Calendar` 图标：

```ts
import { LayoutDashboard, Store, Bell, Settings, BookOpen, Package, Clock, BarChart3, Users, DollarSign, Divide, FileText, MoreHorizontal, X, User, ArrowLeft, Truck, Calendar } from 'lucide-react';
```

**修改 B** — ADMIN_TABS 数组在 `'门店'` 之后插入：

```ts
{ to: '/calendar', icon: Calendar, label: '日历', key: 'dashboard' },
```

> 注：ADMIN_TABS 当前 5 项 + 日历 = 6 项 = MAX_DIRECT，正好不触发"更多"折叠。

**修改 C** — ALL_STORE_TABS 数组在 `'开闭店'` 之后插入：

```ts
{ to: (id: string) => '/store/' + id + '/calendar', icon: Calendar, label: '日历', key: 'storeCalendar' },
```

> 注：ALL_STORE_TABS 当前 13 项 + 日历 = 14 项，必然触发"更多"折叠，日历落在"更多"弹层里。

---

### 步骤 5：StoreGuard.tsx permMap 新增 calendar 映射

**文件**: [StoreGuard.tsx](file:///workspace/apps/web/src/components/StoreGuard.tsx)

**修改** — 在 permMap 数组（第 46-59 行）的 `['/shifts', 'storeShifts']` 之后插入：

```ts
['/calendar', 'storeCalendar'],
```

**理由**: StoreGuard 通过前缀匹配判断当前路由所需权限；缺此项会导致店铺日历页 permKey 默认 `'storeOverview'`，虽仍可通过，但与设计不符。

---

### 步骤 6：版本号同步 v2.1.4 → v2.2.0

按 AGENTS.md 版本规范，新增功能递增次版本号。

**文件 A**: [version.json](file:///workspace/apps/server/data/version.json)
```json
{ "version": "2.2.0" }
```

**文件 B**: [apps/web/package.json](file:///workspace/apps/web/package.json) — `version` 字段改 `2.2.0`

**文件 C**: [apps/server/package.json](file:///workspace/apps/server/package.json) — `version` 字段改 `2.2.0`

---

### 步骤 7：构建验证

**前端构建**:
```bash
cd /workspace/apps/web && rm -rf dist && npx vite build
```
要求：无 TypeScript 编译错误，dist 目录生成。

**后端验证**:
```bash
cd /workspace/apps/server && timeout 8 node --import tsx src/index.ts || true
```
要求：服务能正常启动（监听 3001），无 import 失败。

---

## 三、关键决策与假设

1. **管理端日历权限 key 用 `dashboard`** — 与 DashboardPage 同级，仅 ADMIN/STORE_ADMIN/MANAGER 可见。STAFF/SHAREHOLDER 看不到管理端日历入口。
2. **店铺端日历权限 key 用新建的 `storeCalendar`** — 全角色可见，但内容按角色由后端控制（STAFF profit 字段返回 null，等）。
3. **BottomNav 店铺端"日历"会落在"更多"弹层** — 因 ALL_STORE_TABS 已超 6 项，可接受。
4. **不修改后端** — 后端已 100% 完成，本次纯前端集成。
5. **不修改组件文件** — 4 个页面 + 2 个组件已就位，本次只接线。
6. **数据库表已建** — db.ts 使用 `CREATE TABLE IF NOT EXISTS`，幂等，无需版本化迁移。

---

## 四、验证清单（实现完成后逐条确认）

- [ ] permissions.ts 含 `storeCalendar` 行
- [ ] App.tsx 含 4 个 lazy import + 4 条 Route
- [ ] Sidebar.tsx adminNav 和 storeNav 各含一条日历项
- [ ] BottomNav.tsx ADMIN_TABS 和 ALL_STORE_TABS 各含一条日历项
- [ ] StoreGuard.tsx permMap 含 `['/calendar', 'storeCalendar']`
- [ ] version.json / 2 个 package.json 版本号均为 2.2.0
- [ ] `cd apps/web && rm -rf dist && npx vite build` 成功
- [ ] 后端启动成功，无 import 错误
