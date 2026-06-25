# 系统架构文档

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | 20+ |
| 后端框架 | Express | 5.x |
| TypeScript 运行时 | tsx | 最新 |
| 前端框架 | React | 19.x |
| 构建工具 | Vite | 8.x |
| 数据库 | SQLite (better-sqlite3) | WAL 模式 |
| 认证 | JWT (jsonwebtoken) | - |
| 密码加密 | bcryptjs | - |
| UI 图标 | lucide-react | - |
| CSS | Tailwind CSS | 4.x |
| OCR | 阿里云 OCR | 7.x |

## 目录结构

```
apps/server/src/
├── index.ts           # Express 入口，路由挂载
├── auth.ts            # JWT 认证中间件
├── db.ts              # 数据库初始化、表结构、迁移、种子
├── oplog.ts           # 操作日志记录
├── notify.ts          # 消息推送
├── event-bus.ts       # SSE 事件总线
├── report-scheduler.ts # 定时报表推送
├── health-check-scheduler.ts # 健康证到期检查
├── routes/
│   ├── auth.ts        # 登录/用户信息/密码
│   ├── stores.ts      # 门店 CRUD
│   ├── entries.ts     # 记账 CRUD
│   ├── payroll.ts     # 工资管理
│   ├── dividends.ts   # 分红管理
│   ├── inventory.ts   # 盘点管理
│   ├── shifts.ts      # 开闭店
│   ├── report.ts      # 报表数据
│   ├── dashboard.ts   # 仪表盘数据
│   ├── users.ts       # 员工管理
│   ├── categories.ts  # 分类管理
│   ├── handovers.ts   # 交接记录
│   ├── logs.ts        # 操作日志
│   ├── system.ts      # 系统设置/备份/升级
│   ├── upload.ts      # 文件上传
│   ├── notifications.ts # 通知管理
│   └── health-cert.ts # 健康证管理
└── middleware/
    └── store-access.ts # 门店访问控制

apps/web/src/
├── App.tsx            # 路由配置
├── main.tsx           # 入口
├── index.css          # 全局样式
├── components/        # 通用组件
│   ├── Modal.tsx
│   ├── GlassCard.tsx
│   ├── BottomNav.tsx
│   ├── Sidebar.tsx
│   ├── FloatingActionButton.tsx
│   ├── PeriodTabs.tsx
│   ├── Pagination.tsx
│   └── PageHeader.tsx
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx       # 管理大屏
│   ├── StoresPage.tsx          # 门店管理
│   ├── AdminSettingsPage.tsx   # 系统设置
│   ├── AccountPage.tsx         # 账户信息
│   ├── PasswordPage.tsx        # 修改密码
│   ├── NotificationsPage.tsx   # 通知页面
│   └── settings/
│       └── SettingsPage.tsx    # 系统设置详情
│   └── store/
│       ├── StoreGuard.tsx      # 开店霸屏守卫
│       ├── StoreOverviewPage.tsx
│       ├── StoreEntriesPage.tsx
│       ├── StoreInventoryPage.tsx
│       ├── StoreShiftsPage.tsx
│       ├── StoreReportPage.tsx
│       ├── StorePayrollPage.tsx
│       ├── StoreDividendsPage.tsx
│       ├── StoreStaffPage.tsx
│       ├── StoreLogsPage.tsx
│       ├── StoreSettingsPage.tsx
│       ├── StoreAccountPage.tsx
│       ├── StoreNotificationsPage.tsx
│       └── StoreNotificationSettingsPage.tsx
├── lib/
│   ├── api.ts         # API 客户端
│   ├── sse.ts         # SSE 连接
│   ├── permissions.ts # 权限控制
│   └── format.ts      # 格式化工具
└── stores/
    └── data.ts        # Zustand 全局状态
```

## 核心函数说明

### opLog (oplog.ts)
```typescript
function opLog(userId: number, storeId: number | string, action: string, detail: string)
```
- 记录操作日志到 `op_logs` 表
- 记账修改日志使用 JSON 格式：`{action:'modify', before:{...}, after:{...}}`
- 其他操作直接存储文本

### normalizeType (entries.ts)
```typescript
function normalizeType(type: string): string
// income → 收入
// expense → 支出
```
数据库中统一存储中文类型，前端传入英文自动转换。

## 关键技术决策

### 1. 记账类型归一化
数据库中 `entries.type` 统一存储为 `'收入'` 或 `'支出'`，前端传入 `'income'/'expense'` 自动转换。

### 2. 操作日志格式
- 普通操作：文本字符串
- 修改操作：JSON 格式，包含 before/after 对比

### 3. 数据备份
SQLite WAL 模式下，备份需要：
1. `PRAGMA wal_checkpoint(FULL)` 将 WAL 写回主库
2. 打包 `store.db` + `store.db-wal` + `store.db-shm`

### 4. 服务器重启
使用 `process.exit(0)` 退出，Docker 容器根据 `restart: unless-stopped` 策略自动重启。

### 5. ZIP 升级
1. 用户上传 ZIP 包到服务器临时目录
2. 解压到临时目录
3. 读取 `package.json` 验证版本信息
4. 用新文件覆盖现有文件
5. 通过 `process.exit(0)` 触发容器重启

### 6. SSE 实时通信
- 使用 Server-Sent Events 实现数据变更实时推送
- 客户端通过 EventSource 连接
- 服务端通过 event-bus 广播事件

### 7. 容器启动诊断
容器启动时自动运行 `startup-check.js`，执行 15 项检查：
- package.json 有效性（无 BOM，合法 JSON）
- version.json 存在且有效
- 数据目录完整（data/uploads/backups）
- 数据库可访问 + 表结构完整
- 管理员账号存在
- JWT Secret 存在且长度 >= 32
- 前端文件完整（index.html + JS bundle + SW）
- WAL 文件大小正常
- node_modules 存在
- 环境变量检查（NODE_ENV/PORT/JWT_SECRET）
- 数据库统计信息
- 磁盘空间

发现问题自动修复，不会阻塞启动。

### 8. 容器管理工具 (msl)
容器内运行 `msl` 进入交互式管理工具：
- 系统信息、数据库备份/恢复
- 重置管理员密码
- 查看日志、清理临时文件
- 数据库维护（WAL checkpoint/VACUUM）
- 在线更新、版本回退
- 诊断修复（12 项检查）

### 9. 启动日志
应用启动时显示详细系统状态：
- 版本号、Node 版本、时区、环境
- 端口、CORS 配置
- 数据库统计（用户/门店/记账数量、大小、WAL）
- JWT Secret 状态
- 备份数量、磁盘空间

## 已知技术债

1. **数据库 ID 类型** - `stores.id` 是 TEXT 类型，其他表是 INTEGER，需要兼容处理
2. **编码历史** - 早期文件有编码损坏，已修复但可能存在残留
3. **前端构建** - 单文件超过 100KB，可考虑代码分割
4. **TypeScript** - 部分类型使用 `any`，可逐步加强类型定义
