# 经营日历功能方案 v2.2.0

## 概述

在管理端和店铺端各新增一个"经营日历"页面，以月历形式展示经营数据。管理端看全店铺汇总，点击日期看每家店铺明细；店铺端按角色权限展示不同内容，并支持排休管理和员工日常交接。

**版本**：v2.1.4 → v2.2.0（次版本号，新增功能）
**入口**：管理端 `/calendar`，店铺端 `/store/:storeId/calendar`

---

## 一、现状分析（基于探索结果）

### 已有能力（可直接复用）
| 能力 | 表/接口 | 说明 |
|------|---------|------|
| 记账数据 | `entries` 表 + `/api/stores/:storeId/entries` | type(income/expense)、amount、date、store_id |
| 开闭店+交接 | `store_opens` 表 + `/api/stores/:storeId/shifts` | handover_content 字段存交接内容 |
| 工资单 | `payroll` + `payroll_items` + `/api/stores/:storeId/payrolls` | STAFF 只看自己 |
| 分红 | `dividends` + `dividend_details` + `/api/stores/:storeId/dividends` | STAFF 不可见 |
| 多店汇总 | `/api/dashboard` | 已有 stores[] 数组含每店 income/expense/profit/is_open |
| 单店按日统计 | `/api/stores/:storeId/report?period=day&date=` | 收入/支出/利润/分类 |
| 角色权限 | `permissions.ts` + `lib/roles.ts` | 5 角色 + 25 权限点 |

### 缺失能力（需新建）
1. **排休表**：项目中无任何 rest/schedule/leave 表（已全局搜索确认）
2. **员工日常交接**：现有 `store_opens.handover_content` 仅在开闭店时填写，需新建独立表
3. **日历组件**：前端无任何日历库（仅 lucide-react 的 Calendar 图标），需自研
4. **按月日历汇总 API**：现有 dashboard/report 都是单日或单店，需新建月历聚合接口

---

## 二、核心设计决策（老大已确认）

| 决策点 | 选择 |
|--------|------|
| 管理端日期格展示 | **今日盈利汇总**（绿正红负，最简洁） |
| 管理端点击日期 | 跳转 **日详情页**，显示每家店铺明细 |
| 交接机制 | **新建日常交接表**（staff_handovers），开闭店交接保持现状 |
| 排休权限 | **店长及以上可直接排**（无需审批），ADMIN 可跨店 |
| 排休类型 | **全天休 + 请假**（病假/事假/年假） |
| 店铺端权限 | 按现有 permissions 推断，**STAFF 可看所有人排休** |
| 日历视图 | **月视图 + 日详情页**（点击日期跳转独立页） |

### 店铺端日历各角色内容矩阵

| 内容 | ADMIN/STORE_ADMIN | MANAGER | STAFF | SHAREHOLDER |
|------|:-:|:-:|:-:|:-:|
| 门店收支盈利 | ✅ | ✅ | ❌ | ✅（汇总） |
| 工资明细 | ✅ | ✅ | ✅（仅自己） | ❌ |
| 分红 | ✅ | ❌ | ❌ | ✅ |
| 日常交接（填写+查看） | ✅ | ✅ | ✅（填写+查看全部） | ❌ |
| 开闭店交接（查看） | ✅ | ✅ | ✅ | ✅ |
| 排休（查看） | ✅ | ✅ | ✅（看所有人） | ✅ |
| 排休（管理） | ✅ | ✅ | ❌ | ❌ |

> 依据：现有 `storeDividends: ['ADMIN','STORE_ADMIN','SHAREHOLDER']`、`storeReport: ['ADMIN','STORE_ADMIN','SHAREHOLDER','MANAGER']`、`storeStaff: ['ADMIN','STORE_ADMIN','MANAGER']`。STAFF 可看所有人排休是老大额外要求。

---

## 三、数据库设计

文件：`/workspace/apps/server/src/db.ts`

### 新增表 1：staff_rest_schedules（排休表）
```sql
CREATE TABLE IF NOT EXISTS staff_rest_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  type TEXT NOT NULL,              -- 'rest'(全天休) | 'leave'(请假)
  leave_type TEXT DEFAULT '',      -- 请假子类：sick/personal/annual（type=leave 时有效）
  note TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
-- 唯一约束：同一员工同一天同类型不可重复
CREATE UNIQUE INDEX IF NOT EXISTS idx_rest_user_date_type ON staff_rest_schedules(user_id, date, type);
CREATE INDEX IF NOT EXISTS idx_rest_store_date ON staff_rest_schedules(store_id, date);
```

### 新增表 2：staff_handovers（员工日常交接表）
```sql
CREATE TABLE IF NOT EXISTS staff_handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,              -- YYYY-MM-DD
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  FOREIGN KEY (store_id) REFERENCES stores(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_handover_store_date ON staff_handovers(store_id, date);
CREATE INDEX IF NOT EXISTS idx_handover_user_date ON staff_handovers(user_id, date);
```

### 迁移方式
- 在 db.ts 的初始建表区（第 130 行 `store_opens` 表附近）追加两张表的 `CREATE TABLE IF NOT EXISTS`
- 在索引创建区（第 429-453 行）追加 3 个索引
- 无需版本化迁移（CREATE TABLE IF NOT EXISTS 幂等）

---

## 四、后端 API 设计

### 4.1 新增路由文件：`/workspace/apps/server/src/routes/calendar.ts`

挂载路径（app.ts 第 194 行附近）：`/api/calendar`，需 `authMiddleware`

#### GET `/api/calendar/monthly?year=2026&month=7`
- 权限：MANAGER 及以上（`isManagerOrAbove`）
- 返回：当月每天的全店铺汇总
```json
{
  "days": [
    { "date": "2026-07-01", "profit": 1234.5, "income": 5000, "expense": 3765.5, "storeCount": 5, "openCount": 4 },
    ...
  ]
}
```
- 实现：单条 SQL 按 date 分组聚合 entries（type IN 收入/支出），LEFT JOIN stores 统计开店数

#### GET `/api/calendar/daily?date=2026-07-01`
- 权限：MANAGER 及以上
- 返回：当日每家店铺明细
```json
{
  "date": "2026-07-01",
  "stores": [
    {
      "store_id": "s1", "name": "总店", "is_open": 1,
      "income": 1000, "expense": 500, "profit": 500,
      "open_close": { "open": {...}, "close": {...} },
      "handovers": [ { "user_name": "张三", "content": "...", "type": "daily" } ],
      "rest_staff": [ { "user_name": "李四", "type": "rest" } ]
    }
  ]
}
```
- 实现：批量查询 entries（按 store_id+date 分组）+ store_opens（按 store_id+date）+ staff_handovers（按 store_id+date）+ staff_rest_schedules（按 store_id+date JOIN users）

### 4.2 新增路由文件：`/workspace/apps/server/src/routes/store-calendar.ts`

挂载路径：`/api/stores/:storeId/calendar`，需 `authMiddleware + requireStoreAccess`

#### GET `/api/stores/:storeId/calendar/monthly?year=2026&month=7`
- 权限：所有店铺角色（按权限返回不同字段）
- 返回：当月每天的店铺级汇总
```json
{
  "days": [
    {
      "date": "2026-07-01",
      "profit": 500,              // MANAGER/ADMIN/SHAREHOLDER 可见，STAFF 为 null
      "has_handover": true,       // 当日是否有交接记录
      "rest_count": 2,            // 当日休息人数
      "my_rest": false            // 当前用户当日是否休息
    }
  ]
}
```

#### GET `/api/stores/:storeId/calendar/daily?date=2026-07-01`
- 权限：所有店铺角色（按权限过滤返回字段）
- 返回：当日详情，按角色过滤
```json
{
  "date": "2026-07-01",
  "finance": { "income": 1000, "expense": 500, "profit": 500 },  // STAFF 不返回此字段
  "payroll": [ { "user_name": "张三", "total_amount": 5000 } ],   // STAFF 仅返回自己的
  "dividends": [ { "total_amount": 10000, "details": [...] } ],   // 仅 ADMIN/STORE_ADMIN/SHAREHOLDER
  "handovers": [                                                  // STAFF+ 可见
    { "id": 1, "user_name": "张三", "content": "...", "type": "daily", "created_at": "..." },
    { "id": 2, "user_name": "李四", "content": "...", "type": "shift_close", "created_at": "..." }
  ],
  "rest_schedules": [                                              // 全部角色可见
    { "id": 1, "user_name": "王五", "type": "rest", "leave_type": "", "note": "" }
  ],
  "can_manage_rest": true,                                         // MANAGER 及以上为 true
  "can_view_finance": true,
  "can_view_dividends": false,
  "can_view_payroll_detail": true
}
```

### 4.3 新增路由文件：`/workspace/apps/server/src/routes/rest-schedules.ts`

挂载路径：`/api/stores/:storeId/rest-schedules`，需 `authMiddleware + requireStoreAccess`

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/?dateFrom=&dateTo=` | 全部店铺角色 | 查询排休列表 |
| POST | `/` | MANAGER 及以上 | 创建排休（user_id, date, type, leave_type?, note?） |
| DELETE | `/:id` | MANAGER 及以上 | 删除排休（校验 store_id 归属） |

- 创建/删除时触发 `triggerNotification({ type: 'shift', action: '排休', ... })` + SSE 广播 + opLog

### 4.4 扩展路由：`/workspace/apps/server/src/routes/handovers.ts`

在现有路由基础上新增两个端点（不动现有开闭店交接接口）：

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | `/daily?date=` | 全部店铺角色 | 查询当日日常交接列表（JOIN users 取姓名） |
| POST | `/daily` | 非 SHAREHOLDER | 创建日常交接（content, date） |
| PUT | `/daily/:id` | 自己或 MANAGER 及以上 | 修改自己的交接 |
| DELETE | `/daily/:id` | 自己或 MANAGER 及以上 | 删除自己的交接 |

- 创建时触发 `triggerNotification({ type: 'shift', action: '日常交接', ... })` + SSE 广播

### 4.5 路由挂载（`/workspace/apps/server/src/app.ts`）

在第 194-214 行的路由挂载区追加：
```typescript
import calendarRouter from './routes/calendar.js';
import storeCalendarRouter from './routes/store-calendar.js';
import restSchedulesRouter from './routes/rest-schedules.js';
// handoversRouter 已存在，仅扩展内容

app.use('/api/calendar', authMiddleware, calendarRouter);
app.use('/api/stores/:storeId/calendar', authMiddleware, requireStoreAccess, storeCalendarRouter);
app.use('/api/stores/:storeId/rest-schedules', authMiddleware, requireStoreAccess, restSchedulesRouter);
```

---

## 五、前端设计

### 5.1 新增日历组件：`/workspace/apps/web/src/components/Calendar.tsx`

自研月历组件，不引入第三方库。

**Props**：
```typescript
interface CalendarProps {
  year: number;
  month: number;              // 0-11
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDateClick: (date: string) => void;  // YYYY-MM-DD
  renderCell?: (date: string, isToday: boolean, isCurrentMonth: boolean) => React.ReactNode;
  loading?: boolean;
}
```

**特性**：
- 7 列网格（周一到周日），自动计算 6 行
- 月份切换按钮 + "今天"按钮
- 高亮今天、非本月日期淡化
- 移动端：保持 7 列但单元格高度自适应，点击区域足够大
- 桌面端：单元格最小高度 80px，可放更多内容
- 顶部显示星期标题（一/二/三/四/五/六/日，周末红色）

### 5.2 管理端日历页：`/workspace/apps/web/src/pages/dashboard/CalendarPage.tsx`

- 路由：`/calendar`，权限：`dashboard`（MANAGER 及以上）
- 日历日期格渲染：当日总盈利（绿色正数/红色负数/灰色0），下方小字显示开店数
- 点击日期 → `navigate('/calendar/' + date)`

### 5.3 管理端日详情页：`/workspace/apps/web/src/pages/dashboard/CalendarDetailPage.tsx`

- 路由：`/calendar/:date`，权限：`dashboard`
- 顶部：返回按钮 + 日期标题 + 当日总盈利
- 内容：每家店铺一个 GlassCard，展示：
  - 店铺名 + 开闭店状态徽章（绿"营业中"/红"已闭店"）
  - 收支盈利三列（收入/支出/盈利）
  - 开闭店记录（操作人 + 时间 + 交接内容）
  - 当日日常交接列表（操作人 + 内容）
  - 休息员工列表（姓名 + 类型徽章）

### 5.4 店铺端日历页：`/workspace/apps/web/src/pages/store/StoreCalendarPage.tsx`

- 路由：`/store/:storeId/calendar`，新增权限：`storeCalendar`（全部角色）
- 日历日期格渲染（按角色）：
  - ADMIN/STORE_ADMIN/MANAGER/SHAREHOLDER：当日盈利（绿/红）
  - STAFF：当日标记（有交接●/有排休▲，无内容则空白）
- 点击日期 → `navigate('/store/' + storeId + '/calendar/' + date)`

### 5.5 店铺端日详情页：`/workspace/apps/web/src/pages/store/StoreCalendarDetailPage.tsx`

- 路由：`/store/:storeId/calendar/:date`，权限：`storeCalendar`
- 按权限分区展示：
  - **收支盈利卡片**（ADMIN/STORE_ADMIN/MANAGER/SHAREHOLDER 可见）：收入/支出/盈利
  - **工资卡片**（ADMIN/STORE_ADMIN/MANAGER 可见全部，STAFF 仅自己）：当日确认的工资单
  - **分红卡片**（ADMIN/STORE_ADMIN/SHAREHOLDER 可见）：当日归档的分红
  - **交接区**（STAFF 及以上可见+填写）：
    - 显示当日所有交接（日常 + 开闭店），按时间排序
    - STAFF 及以上可填写日常交接（textarea + 提交按钮）
    - 自己的交接可编辑/删除
  - **排休区**（全部角色可见，MANAGER 及以上可管理）：
    - 显示当日所有排休员工（姓名 + 类型徽章 + 备注）
    - MANAGER 及以上：显示"添加排休"按钮，弹窗选择员工+类型+日期+备注
    - 可删除排休（MANAGER 及以上）

### 5.6 排休管理弹窗组件：`/workspace/apps/web/src/components/RestScheduleModal.tsx`

- Props：`{ open, storeId, date, onClose, onSuccess }`
- 表单：员工选择（下拉，仅本店在职员工）+ 类型（全天休/请假）+ 请假子类（type=leave 时显示：病假/事假/年假）+ 备注
- 提交调用 `POST /api/stores/:storeId/rest-schedules`

### 5.7 路由配置更新：`/workspace/apps/web/src/App.tsx`

在 `<AppShell>` 内新增懒加载路由：
```typescript
const CalendarPage = lazy(() => import('./pages/dashboard/CalendarPage'));
const CalendarDetailPage = lazy(() => import('./pages/dashboard/CalendarDetailPage'));
const StoreCalendarPage = lazy(() => import('./pages/store/StoreCalendarPage'));
const StoreCalendarDetailPage = lazy(() => import('./pages/store/StoreCalendarDetailPage'));

// 管理端
<Route path="calendar" element={<Guard perm="dashboard"><CalendarPage /></Guard>} />
<Route path="calendar/:date" element={<Guard perm="dashboard"><CalendarDetailPage /></Guard>} />

// 店铺端
<Route path="calendar" element={<StoreGuard perm="storeCalendar"><StoreCalendarPage /></StoreGuard>} />
<Route path="calendar/:date" element={<StoreGuard perm="storeCalendar"><StoreCalendarDetailPage /></StoreGuard>} />
```

### 5.8 导航更新

#### `/workspace/apps/web/src/lib/permissions.ts`
新增权限点：
```typescript
storeCalendar: ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
```

#### `/workspace/apps/web/src/layouts/Sidebar.tsx`
- adminNav 新增：`{ to: '/calendar', icon: Calendar, label: '经营日历', key: 'dashboard' }`（位置：仪表盘之后）
- storeNav 新增：`{ to: '/store/' + storeId + '/calendar', icon: Calendar, label: '经营日历', key: 'storeCalendar' }`（位置：门店总览之后）

#### `/workspace/apps/web/src/layouts/BottomNav.tsx`
- ALL_STORE_TABS 新增日历项（位置靠前，确保不折叠到"更多"）
- ADMIN_TABS 视情况新增

#### `/workspace/apps/web/src/components/StoreGuard.tsx`
- permMap 新增：`calendar: 'storeCalendar'`、`calendar/:date: 'storeCalendar'`

### 5.9 API 客户端更新：`/workspace/apps/web/src/lib/api.ts`

无需新增函数，直接使用现有 `api.get/api.post`。如需缓存可参考现有 LRU 配置，calendar/monthly 缓存 60 秒。

---

## 六、通知与实时推送

### 排休通知
- 创建/删除排休时调用 `triggerNotification({ type: 'shift', action: '排休通知', storeId, detail: '张三 2026-07-01 全天休', operatorName })`
- 复用现有 `push_openclose_notify` 开关字段（同属 shift 类型）
- SSE 广播 `eventBus.broadcast({ type: 'rest', action: 'new' })`

### 日常交接通知
- 创建日常交接时调用 `triggerNotification({ type: 'shift', action: '日常交接', storeId, detail: '张三 提交了交接', operatorName })`
- 复用 shift 类型开关
- SSE 广播 `eventBus.broadcast({ type: 'handover', action: 'new' })`

---

## 七、假设与决策

1. **不引入第三方日历库**：项目 UI 全自研（Tailwind v4），保持一致性，自研月历组件复杂度可控。
2. **排休表唯一约束**：同一员工同一天同类型不可重复（user_id+date+type 唯一索引），避免重复排休。
3. **日常交接编辑/删除**：仅本人或 MANAGER 及以上可操作，避免员工互相覆盖。
4. **工资/分红在日历的展示**：只展示"当日确认/归档"的工资单和分红（按 confirmed_at/archived_at 日期），而非 period。
5. **历史数据范围**：日历不限制历史范围，依赖 entries/store_opens 等已有数据自然展示（早期数据可能不全，但不做特殊处理）。
6. **ADMIN 跨店排休**：ADMIN 在店铺端日历详情页可为任意店铺员工排休（requireStoreAccess 已放行 ADMIN）。
7. **月历性能**：单月查询 30 天，单 SQL 聚合，预计 < 50ms，无需分页。
8. **移动端适配**：日历保持 7 列但单元格内容精简（仅显示数字/标记），详情通过点击跳转日详情页查看。

---

## 八、实施步骤（建议顺序）

### 步骤 1：数据库迁移
- 编辑 `/workspace/apps/server/src/db.ts`，新增 2 张表 + 3 个索引
- 重启服务验证表创建成功

### 步骤 2：后端 API
- 新建 `routes/rest-schedules.ts`
- 新建 `routes/calendar.ts`（管理端）
- 新建 `routes/store-calendar.ts`（店铺端）
- 扩展 `routes/handovers.ts`（日常交接端点）
- 编辑 `app.ts` 挂载新路由
- 用 curl 测试每个端点

### 步骤 3：前端日历组件
- 新建 `components/Calendar.tsx`
- 新建 `components/RestScheduleModal.tsx`
- 本地验证组件渲染

### 步骤 4：管理端日历页
- 新建 `pages/dashboard/CalendarPage.tsx`
- 新建 `pages/dashboard/CalendarDetailPage.tsx`
- 编辑 `App.tsx` 添加路由
- 编辑 `Sidebar.tsx` 添加菜单

### 步骤 5：店铺端日历页
- 新建 `pages/store/StoreCalendarPage.tsx`
- 新建 `pages/store/StoreCalendarDetailPage.tsx`
- 编辑 `App.tsx` 添加路由
- 编辑 `Sidebar.tsx`、`BottomNav.tsx`、`StoreGuard.tsx`
- 编辑 `permissions.ts` 添加权限点

### 步骤 6：联调与验证
- 启动后端 + 前端
- 各角色账号登录验证权限矩阵
- 测试排休创建/删除、日常交接填写
- 验证通知推送

### 步骤 7：版本号更新与构建
- 更新 `version.json` 为 v2.2.0
- 更新 `package.json` 版本号
- `cd apps/web && rm -rf dist && npx vite build` 构建前端
- 验证 dist 内容
- 用 tar 命令打包 ZIP（按 AGENTS.md 规范）

---

## 九、验证清单

### 功能验证
- [ ] 管理端日历显示当月每日总盈利（绿正红负）
- [ ] 管理端点击日期跳转详情页，显示每家店铺明细
- [ ] 管理端详情页显示开闭店、收支、交接、休息员工
- [ ] 店铺端日历按角色显示不同内容
- [ ] STAFF 看不到收支/分红，但能看到所有人排休
- [ ] SHAREHOLDER 看不到工资明细和员工交接
- [ ] MANAGER 可创建/删除排休
- [ ] STAFF 可填写日常交接，可编辑/删除自己的
- [ ] 排休和交接触发通知推送
- [ ] 移动端日历可用，点击区域足够大

### 权限验证
- [ ] STAFF 访问 `/calendar` 管理端日历被拦截
- [ ] SHAREHOLDER 在店铺端看不到工资卡片
- [ ] STAFF 在店铺端看不到分红卡片
- [ ] STAFF 不能创建排休（接口返回 403）

### 数据验证
- [ ] 同一员工同一天同类型排休不可重复
- [ ] 删除排休时校验 store_id 归属
- [ ] 编辑/删除日常交接仅本人或 MANAGER+

---

## 十、涉及文件清单

### 后端新增（4 个）
- `/workspace/apps/server/src/routes/calendar.ts`
- `/workspace/apps/server/src/routes/store-calendar.ts`
- `/workspace/apps/server/src/routes/rest-schedules.ts`
- （handovers.ts 为扩展，不算新增）

### 后端修改（3 个）
- `/workspace/apps/server/src/db.ts`（新增 2 表 + 3 索引）
- `/workspace/apps/server/src/app.ts`（挂载 3 个新路由）
- `/workspace/apps/server/src/routes/handovers.ts`（新增 4 个日常交接端点）

### 前端新增（6 个）
- `/workspace/apps/web/src/components/Calendar.tsx`
- `/workspace/apps/web/src/components/RestScheduleModal.tsx`
- `/workspace/apps/web/src/pages/dashboard/CalendarPage.tsx`
- `/workspace/apps/web/src/pages/dashboard/CalendarDetailPage.tsx`
- `/workspace/apps/web/src/pages/store/StoreCalendarPage.tsx`
- `/workspace/apps/web/src/pages/store/StoreCalendarDetailPage.tsx`

### 前端修改（5 个）
- `/workspace/apps/web/src/App.tsx`（新增 4 条路由）
- `/workspace/apps/web/src/lib/permissions.ts`（新增 storeCalendar 权限点）
- `/workspace/apps/web/src/layouts/Sidebar.tsx`（新增 2 个菜单项）
- `/workspace/apps/web/src/layouts/BottomNav.tsx`（新增菜单项）
- `/workspace/apps/web/src/components/StoreGuard.tsx`（permMap 新增映射）

### 配置/版本（2 个）
- `/workspace/version.json`（v2.1.4 → v2.2.0）
- `/workspace/apps/server/package.json` + `/workspace/apps/web/package.json`（版本号同步）

**总计：新增 10 个文件，修改 10 个文件**
