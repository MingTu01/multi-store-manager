# Multi-Store Manager 全维度深度审查报告

> **项目：** 多店铺管理系统 (multi-shop-link v1.1.73)
> **技术栈：** Express + better-sqlite3 + React + Vite + Zustand + TypeScript
> **代码规模：** ~23,000 行，44 个源文件
> **审查日期：** 2026-06-20
> **审查维度：** 安全审计、后端代码质量、前端代码质量、数据库与 API 设计、功能完整性、代码规范与开发体验、基础设施与运维

---

## 目录

- [一、严重问题（必须立即修复）](#一严重问题必须立即修复)
- [二、主要问题（应尽快修复）](#二主要问题应尽快修复)
  - [2.1 安全类](#21-安全类)
  - [2.2 功能 Bug 类](#22-功能-bug-类)
  - [2.3 前端架构类](#23-前端架构类)
  - [2.4 后端架构类](#24-后端架构类)
- [三、中等问题](#三中等问题)
- [四、亮点与优秀实践](#四亮点与优秀实践)
- [五、功能完整性分析](#五功能完整性分析)
  - [5.1 功能清单](#51-功能清单)
  - [5.2 功能缺失](#52-功能缺失)
  - [5.3 前后端对齐问题](#53-前后端对齐问题)
- [六、数据库与 API 设计审查](#六数据库与-api-设计审查)
  - [6.1 数据库层](#61-数据库层)
  - [6.2 API 设计](#62-api-设计)
- [七、基础设施与运维审查](#七基础设施与运维审查)
- [八、修复优先级路线图](#八修复优先级路线图)
- [九、总结](#九总结)

---

## 一、严重问题（必须立即修复）

### 1.1 路径穿越漏洞 — 任意文件读取

**严重程度：** 🔴 CRITICAL
**位置：** `apps/server/src/routes/health-cert.ts` 第 41 行

```ts
const imagePath = join(BASE_DIR, url.replace(/^\//, ''));
```

`url` 直接来自请求体，仅去除了开头的 `/`。攻击者可发送 `url: "../../etc/passwd"` 或 `url: "data/store.db"` 读取服务器任意文件。该文件内容会被发送至阿里云 OCR 接口，构成数据外泄通道。

**对比：** 同项目中 `routes/reports.ts` 和 `routes/system.ts` 已使用 `safePath()` 工具函数进行路径校验，唯独此端点遗漏。

**修复建议：**
```ts
const resolvedPath = path.resolve(imagePath);
const uploadsDir = path.resolve(BASE_DIR, 'uploads');
if (!resolvedPath.startsWith(uploadsDir)) {
  return res.status(400).json({ error: '无效的文件路径' });
}
```

---

### 1.2 CORS 默认允许任意来源 + 凭证

**严重程度：** 🔴 CRITICAL
**位置：** `apps/server/src/index.ts` 第 45-55 行

当环境变量 `CORS_ORIGIN` 未设置时（默认情况），CORS 中间件的回退逻辑允许**任何域名**携带凭证（`credentials: true`）发起跨域请求，完全绕过浏览器同源策略。恶意网站可通过 JavaScript 调用本系统的 API 并读取响应数据。

**修复建议：**
- 生产环境必须强制设置 `CORS_ORIGIN`
- 未设置时拒绝启动，或降级为 `'same-origin'` 而非通配符
- 删除 `.env.example` 中的 `CORS_ORIGIN=*` 示例

---

### 1.3 默认管理员密码 `123456`

**严重程度：** 🔴 CRITICAL
**位置：** `apps/server/src/db.ts` 第 324-328 行

```ts
const hash = bcrypt.hashSync('123456', 10);
db.prepare("INSERT INTO users ... VALUES (?, ?, ?, ?)").run('admin', hash, '管理员', 'ADMIN');
```

首次部署时默认管理员账号密码为 `123456`，且系统无强制首次登录修改密码的机制。若部署者忘记修改，等同于门户大开。

**修复建议：**
- 启动时强制要求 `ADMIN_PASSWORD` 环境变量，未设置则拒绝启动
- 或生成随机密码，仅在首次启动时打印到 stdout
- 添加首次登录强制修改密码逻辑

---

### 1.4 多表写操作无事务保护 — 数据损坏风险

**严重程度：** 🔴 CRITICAL
**涉及文件与操作：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `routes/stores.ts:136-144` | 店铺删除 | 8 条 DELETE 语句逐条执行，中途崩溃导致数据残留 |
| `routes/payroll.ts:135-136` | 工资确认 | 更新状态 + 创建支出记录，崩溃可导致状态已变但未记账 |
| `routes/dividends.ts:93-94` | 分红归档 | 更新归档状态 + 创建支出记录，同上风险 |
| `routes/inventory.ts:193-216` | 库存盘点批量完成 | 插入记录 + 更新多个库存数量，无原子性保障 |

**修复建议：** 所有多步写操作包裹在 `db.transaction()` 中：

```ts
const confirmPayroll = db.transaction((payrollId) => {
  db.prepare('UPDATE payroll SET status = ? WHERE id = ?').run('confirmed', payrollId);
  db.prepare('INSERT INTO entries ...').run(/* ... */);
});
```

---

### 1.5 Docker Compose 默认 JWT 密钥已公开

**严重程度：** 🔴 CRITICAL
**位置：** `docker-compose.yml` 第 16 行

```yaml
JWT_SECRET=${JWT_SECRET:-please-change-this-secret}
```

此文件位于公开 GitHub 仓库中，任何人可读取默认密钥并伪造合法 JWT 令牌。

**修复建议：**
- 移除默认值，要求必须配置
- 或在应用启动时检测到使用默认密钥时拒绝启动并输出警告

---

### 1.6 容器以 root 运行

**严重程度：** 🔴 CRITICAL
**位置：** `Dockerfile`

Dockerfile 中无 `USER` 指令，容器默认以 root 身份运行。若应用存在 RCE 漏洞，攻击者直接获得容器内 root 权限，可进一步尝试容器逃逸。

**修复建议：**
```dockerfile
RUN useradd -m -r appuser
RUN chown -R appuser:appuser /app/data /app/uploads /app/backups
USER appuser
```

---

### 1.7 健康证端点无文件类型过滤

**严重程度：** 🔴 CRITICAL
**位置：** `apps/server/src/routes/health-cert.ts` 第 17-29 行

multer 配置无 `fileFilter`，可上传任意文件类型（`.html`、`.svg`、`.js`、可执行文件等）。文件通过 `express.static` 提供服务，攻击者上传 HTML 文件后可实现存储型 XSS。

**对比：** `routes/upload.ts` 正确配置了 MIME 类型白名单和 5MB 大小限制。

**修复建议：**
- 添加 `fileFilter` 仅允许 `image/jpeg`、`image/png`、`image/webp`
- 文件名使用 UUID 而非可预测的 `health_{userId}_{timestamp}` 模式
- 上传后校验文件 magic bytes（文件头签名）

---

### 1.8 升级 ZIP 可执行任意代码

**严重程度：** 🔴 CRITICAL
**位置：** `apps/server/src/routes/system.ts` 第 399 行

```ts
execSync('node "' + postUpgradeScript + '"')
```

升级端点接受用户上传的 ZIP 文件，解压后直接执行其中的 `post-upgrade.cjs` 脚本。如果 ZIP 包在传输过程中被篡改或来自不可信来源，其中的恶意脚本将获得服务器完整执行权限。

**修复建议：**
- 升级包添加数字签名，执行前验证签名
- 仅允许从官方更新源下载，禁用任意 ZIP 上传
- 如必须支持手动上传，应在沙箱环境中预执行验证

---

## 二、主要问题（应尽快修复）

### 2.1 安全类

#### 2.1.1 JWT 存于 localStorage

**严重程度：** HIGH
**位置：** `apps/web/src/lib/api.ts` 第 4 行，`apps/web/src/stores/data.ts` 第 35 行

JWT 令牌存储在 `localStorage` 中，任何 XSS 漏洞均可通过 `localStorage.getItem('token')` 窃取令牌。结合 CSP 的 `unsafe-inline` 配置，XSS 利用难度很低。

**修复建议：** 改用 `HttpOnly` + `Secure` + `SameSite=Strict` 的 Cookie 存储令牌。

---

#### 2.1.2 SSE 通过 URL 查询参数传递 Token

**严重程度：** HIGH
**位置：** `apps/web/src/lib/sse.ts` 第 21 行，`apps/server/src/auth.ts` 第 55-57 行

```ts
// 前端
const es = new EventSource('/api/sse?token=' + encodeURIComponent(currentToken));

// 后端
if (!token && req.query.token) {
  token = req.query.token as string;
}
```

URL 中的令牌会出现在浏览器历史记录、服务器访问日志、代理日志和 Referer 头中。

**修复建议：** 实现一次性 SSE Ticket 机制：通过 POST 端点获取短期有效的单次令牌，再用该令牌建立 SSE 连接。

---

#### 2.1.3 用户可自行验证健康证

**严重程度：** HIGH
**位置：** `apps/server/src/routes/health-cert.ts` 第 191-208 行

`PUT /save` 端点允许任何已认证用户将自己的 `health_cert_verified` 字段设为 `true`，无需管理员审批。

**修复建议：** 从用户可修改字段中移除 `verified`，仅管理员可通过独立端点设置。

---

#### 2.1.4 无 Token 撤销机制

**严重程度：** MEDIUM
**位置：** `apps/server/src/auth.ts`

JWT 一旦签发，在过期前（默认 24 小时）始终有效。密码修改、账号禁用后，旧令牌仍可使用。

**修复建议：**
- 在 users 表添加 `token_version` 字段
- 密码修改/登出时递增版本号
- JWT 中包含版本号，中间件校验版本匹配

---

#### 2.1.5 无全局速率限制

**严重程度：** MEDIUM
**位置：** `apps/server/src/index.ts`

仅登录端点配置了 5 次/分钟的限制。备份、恢复、升级、文件上传等昂贵操作完全无限制。

**修复建议：**
- 添加全局限制（如 100 次/分钟/IP）
- 对昂贵操作添加更严格的独立限制

---

#### 2.1.6 日志端点无权限控制

**严重程度：** MEDIUM
**位置：** `apps/server/src/routes/logs.ts`

任何已认证用户（包括 STAFF）均可查看全部操作日志，包含操作详情、IP 地址和用户名等敏感信息。

**修复建议：** 限制为 MANAGER 及以上角色，或 STAFF 仅可查看自己的操作日志。

---

#### 2.1.7 CSP 允许 unsafe-inline 和 unsafe-eval

**严重程度：** MEDIUM
**位置：** `apps/server/src/index.ts` 第 68-76 行

```ts
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

`unsafe-inline` 和 `unsafe-eval` 使得 CSP 的 XSS 防护基本失效。注入的内联脚本可直接执行。

**修复建议：** 使用 nonce-based CSP（`script-src 'self' 'nonce-{random}'`）或 `'strict-dynamic'`。生产环境应移除 `unsafe-eval`。

---

#### 2.1.8 错误信息泄露内部细节

**严重程度：** MEDIUM
**位置：** 多个路由文件

```ts
} catch (err: any) {
  res.status(500).json({ error: err.message });
}
```

`err.message` 直接返回客户端，可能暴露内部路径、数据库结构、堆栈信息。

**修复建议：** 全局错误处理器统一处理，生产环境返回通用错误消息。

---

#### 2.1.9 弱密码策略

**严重程度：** MEDIUM
**位置：** `routes/auth.ts` 第 76 行，`routes/stores.ts` 第 190 行

最低密码长度 6 字符，无复杂度要求。新员工默认密码硬编码为 `123456`。

**修复建议：** 最少 8 字符 + 至少一个数字。新员工生成随机临时密码，首次登录强制修改。

---

#### 2.1.10 HTML 报表无净化处理

**严重程度：** MEDIUM
**位置：** `apps/server/src/routes/reports.ts` 第 32-35 行

HTML 报表文件使用 `res.send(content)` 直接返回，若报表文件被篡改，恶意 JavaScript 将在应用域名下执行。

**修复建议：** 使用 `Content-Disposition: attachment` 强制下载，或在沙箱 iframe 中展示。

---

### 2.2 功能 Bug 类

#### 2.2.1 报告重复发送

**严重程度：** HIGH
**位置：** `apps/server/src/report-scheduler.ts` + `apps/server/src/index.ts` setupCron

系统中存在**两套报告定时发送机制**同时运行：
- `report-scheduler.ts`：每天 21:00 发送
- `index.ts` `setupCron()`：每天 22:00 发送

导致日报、周报、月报各发送两遍。

**修复建议：** 删除 `report-scheduler.ts` 或 `setupCron` 中的一个。

---

#### 2.2.2 分红比例显示 Bug

**严重程度：** HIGH
**位置：** `apps/web/src/pages/store/StoreDividendsPage.tsx` 第 166 行

```tsx
(sh.ratio * 100).toFixed(0) + '%'
```

若 `ratio` 已经是百分比数值（如 50 代表 50%），乘以 100 后显示为 "5000%"。需确认后端存储格式并统一处理。

---

#### 2.2.3 库存排序 API 不匹配

**严重程度：** HIGH
**位置：** `StoreInventoryPage.tsx` vs `routes/inventory.ts`

| 维度 | 前端 | 后端 |
|------|------|------|
| HTTP 方法 | `PUT` | `POST` |
| 请求体格式 | `{ ids: [...] }` | `{ order: [{id, sort_order}] }` |

排序功能当前**完全不可用**，前端请求会被 404 拒绝。

---

#### 2.2.4 SSE 双重连接

**严重程度：** MEDIUM
**位置：** `apps/web/src/App.tsx` + `apps/web/src/components/ConnectionStatus.tsx`

`useSSE()` 在两处被调用，每次页面加载创建两个 EventSource 连接，加倍服务器负载并导致重复的缓存失效和通知获取。

---

#### 2.2.5 员工角色可提权

**严重程度：** HIGH
**位置：** `apps/server/src/routes/stores.ts` 第 224 行

```ts
if (role !== undefined) { fields.push('role=?'); vals.push(role); }
```

`PUT /:storeId/staff/:id` 端点中，`STORE_ADMIN` 可将员工角色设置为 `ADMIN`，无越权校验。

**修复建议：** 添加角色分配权限矩阵，确保调用者只能分配其权限范围内的角色。

---

#### 2.2.6 周报同比计算错误

**严重程度：** MEDIUM
**位置：** `apps/server/src/routes/report.ts` 第 73-75 行

"周"维度的同比计算减去的是 7 天而非 1 年，实际变成了环比而非同比。`dashboard.ts` 中的处理是正确的。

---

#### 2.2.7 工资确认存在竞态条件

**严重程度：** MEDIUM
**位置：** `apps/server/src/routes/payroll.ts` 第 136 行

快速双击确认按钮可绕过 `status === 'confirmed'` 检查，创建重复的支出记录。添加幂等性保护或前端防抖。

---

#### 2.2.8 零金额记录允许提交

**严重程度：** LOW
**位置：** `apps/server/src/routes/entries.ts` 第 68-69 行

验证逻辑检查 `amount < 0` 和 `amount > 9999999`，但允许 `amount = 0`。零金额记录无意义且污染数据。

---

### 2.3 前端架构类

#### 2.3.1 无 Error Boundary

**严重程度：** HIGH

整个应用无任何 React Error Boundary。任何组件渲染时的空指针访问、类型错误都会导致**整个应用白屏崩溃**。

**修复建议：** 至少在 `App.tsx` 的路由层包裹 Error Boundary，展示友好的错误页面。

---

#### 2.3.2 `any` 类型泛滥

**严重程度：** HIGH

| 层级 | `any` 出现次数 |
|------|--------------|
| 后端 (`apps/server/src`) | ~162 次 |
| 前端 (`apps/web/src`) | ~130 次 |

典型模式：
```ts
// 后端 — 所有数据库查询结果未定义类型
const user = db.prepare('SELECT ...').get(id) as any;

// 前端 — 所有页面状态用 any
const [entries, setEntries] = useState<any[]>([]);
```

`lib/types.ts` 中定义了 `StoreInfo`、`Entry`、`UserInfo` 等接口，但几乎未被使用。

---

#### 2.3.3 `alert()/confirm()` 遍地

**严重程度：** MEDIUM

以下页面使用浏览器原生弹窗，在 PWA 中体验极差：

| 页面 | 使用场景 |
|------|---------|
| `StoreEntriesPage.tsx` | 删除确认 |
| `StoreInventoryPage.tsx` | 错误提示、删除确认、操作结果 |
| `StoreShiftsPage.tsx` | 错误提示 |
| `StorePayrollPage.tsx` | 错误提示、确认操作 |
| `StoreDividendsPage.tsx` | 错误提示 |
| `StoreStaffPage.tsx` | 错误提示、确认删除 |

项目已有 `Toast` 和 `Modal` 组件，应统一使用。

---

#### 2.3.4 严重代码重复

| 重复内容 | 涉及文件 | 建议 |
|---------|---------|------|
| 通知页面 ~90% 相同 | `NotificationsPage.tsx` + `StoreNotificationsPage.tsx` | 提取共用 `NotificationList` 组件 |
| 账号编辑逻辑 | `AdminSettingsPage.tsx` + `StoreAccountPage.tsx` | 提取共用 hook |
| 滑动日期切换 | `DashboardPage.tsx` + `StoreReportPage.tsx` | 提取到 `PeriodTabs` 或工具函数 |
| 图表渲染代码 | `DashboardPage.tsx` + `StoreReportPage.tsx` | 提取共用图表组件 |
| `inputCls` 样式常量 | 5+ 文件各自定义 | 提取为共享常量 |
| 加载 spinner | 10+ 文件各自定义 | 提取为 `LoadingSpinner` 组件 |
| 门店数据获取 | 5+ 页面独立调用 `/stores/:id` | 使用全局状态或缓存 |

---

#### 2.3.5 无全局数据请求抽象

每个页面独立管理 `{ data, loading, error }` 状态，使用 `useEffect` + `api.get().then().catch()` 模式。缺少统一的数据获取 hook（如 `useQuery`），导致：
- 加载/错误状态处理不一致
- 无法统一实现缓存、重试、乐观更新
- 重复代码量大

---

### 2.4 后端架构类

#### 2.4.1 TypeScript strict 模式关闭

**严重程度：** HIGH
**位置：** `apps/server/tsconfig.json`

```json
{
  "strict": false,
  "noUnusedLocals": false,
  "noUnusedParameters": false
}
```

编译器无法捕获空值错误、隐式 `any`、未使用代码。这是代码中 `any` 泛滥的根因。

**对比：** 前端 `tsconfig.app.json` 已启用 `strict: true`。

---

#### 2.4.2 数据库迁移系统脆弱

**严重程度：** HIGH
**位置：** `apps/server/src/db.ts`

```ts
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}
```

问题：
- **无迁移版本号** — 无法知道哪些迁移已执行
- **无回滚能力** — 部分失败无法恢复
- **静默所有错误** — 语法错误、磁盘满等也被吞掉
- **无迁移历史表** — 无 `schema_migrations` 等记录

---

#### 2.4.3 N+1 查询问题

**严重程度：** MEDIUM

| 位置 | 问题 |
|------|------|
| `payroll.ts GET /` | 每条工资单单独查询 items，20 条 = 21 次查询 |
| `dividends.ts GET /` | 每条分红单独查询 details，同上 |
| `inventory.ts GET /` | 每条盘点单独查询 items_count |
| `dashboard.ts GET /trend` | 日趋势 30 天 × 2 = 60 次查询 |
| `dashboard.ts GET /` 基金余额 | 遍历所有门店，每个 2 次查询，100 门店 = 201 次 |

**修复建议：** 使用 `GROUP BY` 聚合查询替代循环查询。

---

#### 2.4.4 未使用的 `exec` 导入

**严重程度：** LOW
**位置：** `apps/server/src/routes/system.ts` 第 8 行

```ts
import { exec } from 'child_process';
```

`exec` 从未使用（实际使用的是通过 `require` 导入的 `execSync`）。此导入暗示可能存在命令执行意图。

---

#### 2.4.5 OpLog 表无限增长

**严重程度：** MEDIUM

`op_logs` 表无轮转机制，随着业务操作增加将持续增长，最终影响查询性能和磁盘空间。

**修复建议：** 添加定期清理任务（如保留 6 个月），或实现日志归档。

---

## 三、中等问题

### 3.1 项目配置

| 问题 | 位置 | 说明 |
|------|------|------|
| 版本号不一致 | 根目录 `1.1.73`，server `1.2.0`，web `1.1.73` | 升级时可能产生混淆 |
| `.gitignore` 忽略 lock 文件 | `.gitignore` | `package-lock.json` 应提交以保证可复现安装 |
| ESLint 已安装但未配置 | `apps/web/package.json` | 无 `eslint.config.js`，`npm run lint` 无效 |
| 硬编码绝对路径 | `build-upgrade.js` 第 6 行 | `C:/Users/Administrator/Documents/6666` 写死 |
| 同步 bcrypt | 多个路由文件 | `hashSync/compareSync` 阻塞事件循环，应改用异步版本 |

### 3.2 数据库

| 问题 | 位置 | 说明 |
|------|------|------|
| 无外键约束 DDL | `db.ts` | `REFERENCES` 从未使用，完整性完全依赖应用层 |
| 角色字段无 CHECK 约束 | `db.ts` | 可插入任意字符串作为角色 |
| 状态字段无 CHECK 约束 | `db.ts` | 同上 |
| 缺少索引 | `db.ts` | `entries(category_id)`、`store_opens(store_id, created_at DESC)` |
| 照片以 JSON 文本存储 | `stores.photos`、`store_opens.photos` | 无数据库层 JSON 校验 |

### 3.3 API 设计

| 问题 | 位置 | 说明 |
|------|------|------|
| 响应格式不统一 | 全部路由 | `{ stores: [] }`、`{ data: [] }`、直接数组混用 |
| 分页参数不统一 | 全部路由 | 部分有 `totalPages`，部分没有；`users` 端点无分页 |
| 无最大分页限制 | 全部路由 | `pageSize=999999` 可倾泻全表 |
| HTTP 方法不规范 | `dividends.ts` | `PUT /:id/archive` 应为 `POST` 或 `PATCH` |
| `entries.ts` 双模式 | `routes/entries.ts` | 同时支持 legacy `limit` 和 `page/pageSize` |

### 3.4 前端

| 问题 | 位置 | 说明 |
|------|------|------|
| 混合行尾符 | 多个前端文件 | `\r\n` 和 `\r` 混用 |
| `store_id` 类型不一致 | `User.store_id: number` vs `StoreInfo.id: string` | 依赖隐式类型转换 |
| 全局隐藏滚动条 | `index.css` | `body { scrollbar-width: none }` 用户可能不知有更多内容 |
| `<html>` 缺少 `lang` 属性 | `index.html` | 屏幕阅读器需要此属性 |

### 3.5 代码规范

| 问题 | 位置 | 说明 |
|------|------|------|
| 调试代码残留 | `index.ts:101` | `console.log` 读取 index.html 内容 |
| 冗余 `require()` | `index.ts:101,277` | ESM 模块中混用 CommonJS require |
| 股东匹配用 name | `store-access.ts:15-17` | 应通过 `user_id` 外键关联 |
| `autoStatus` 未使用 | `inventory.ts:10-13` | 定义但从未调用 |
| `requireFreshUser` 引用不存在的全局变量 | `auth.ts:76-85` | `globalThis.__db` 从未设置 |
| 种子数据类型不一致 | `seed-test-data.ts` | 使用 `'income'`/`'expense'`，主程序用 `'收入'`/`'支出'` |
| `notify-trigger.ts` 接口缺少字段 | `notify-trigger.ts:7-13` | `operatorName` 被使用但未在接口中声明 |

---

## 四、亮点与优秀实践

### 4.1 安全基础

| 实践 | 位置 | 说明 |
|------|------|------|
| JWT 密钥管理 | `auth.ts` | 环境变量 → 文件持久化 → 随机生成的优雅降级链 |
| 安全头配置 | `index.ts:58-79` | CSP、X-Frame-Options、X-Content-Type-Options、Referrer-Policy |
| 登录速率限制 | `routes/auth.ts` | 5 次/分钟/IP |
| 路径穿越防护 | `middleware/store-access.ts` | `safePath()` 函数在多个路由中正确使用 |
| 上传文件校验 | `routes/upload.ts` | MIME 类型白名单 + 5MB 大小限制 |

### 4.2 数据库

| 实践 | 位置 | 说明 |
|------|------|------|
| WAL 模式 | `db.ts` | 并发读写性能优化 |
| 外键 pragma | `db.ts` | `PRAGMA foreign_keys = ON` |
| 18 个索引 | `db.ts` | 覆盖所有主要查询模式 |
| SQLITE_BUSY 重试 | `db.ts` | `dbRunWithRetry` 指数退避 |
| 种子数据使用事务 | `seed-test-data.ts` | 批量插入包裹在事务中 |

### 4.3 业务架构

| 实践 | 说明 |
|------|------|
| RBAC 角色体系 | 5 级角色（ADMIN/STORE_ADMIN/MANAGER/STAFF/SHAREHOLDER）+ 干净的辅助函数 |
| 店铺级访问控制中间件 | `requireStoreAccess` 统一检查管理员、店铺分配、股东状态 |
| SSE 实时推送 | 自定义 EventBus，自动清理死连接，排除自身用户避免回显 |
| 操作审计日志 | `opLog()` 记录所有关键业务操作含用户、动作、详情、IP |
| 多渠道通知 | 应用内 + PushPlus + Server酱 + 企业微信，按店铺独立配置 |
| 自动备份 | WAL checkpoint + 30 文件保留限制 |
| 备份恢复验证 | 恢复前备份 → 恢复后验证 → 失败自动回滚 |
| 通知自动清理 | 已读通知超过 48 小时自动清理 |

### 4.4 前端

| 实践 | 说明 |
|------|------|
| 路由懒加载 | `React.lazy()` 实现代码分割 |
| 客户端缓存 | `lib/api.ts` 带 TTL 的内存缓存，模式匹配失效 |
| 组件设计 | GlassCard、Modal、Pagination、VirtualList、ImagePreview 抽象良好 |
| PWA 支持 | Workbox 缓存策略、manifest、图标、自动更新 |
| Vite 分包 | 手动分离 react、charts、icons、state 为独立 chunk |

### 4.5 基础设施

| 实践 | 说明 |
|------|------|
| 文档完整度 | README + ARCHITECTURE + DEPLOY + UPGRADE 四份文档 |
| Docker HEALTHCHECK | 内置健康检查 |
| 优雅关闭 | SIGTERM/SIGINT 处理 |
| 升级脚本预验证 | `esbuild.transformSync` 编译检查后再打包 |
| 升级版本兼容检查 | `MAX_MINOR_JUMP = 5` 防止跨大版本升级 |
| 缓存控制 | HTML no-store，JS/CSS 1h，图片 30d 差异化策略 |

---

## 五、功能完整性分析

### 5.1 功能清单

#### 已完成功能

| 功能模块 | 后端 | 前端 | 状态 |
|---------|------|------|------|
| 登录认证（用户名/密码） | ✅ | ✅ | 完成 |
| 角色权限控制（5级） | ✅ | ✅ | 完成 |
| 店铺 CRUD + 股东管理 | ✅ | ✅ | 完成 |
| 员工管理 + 头像 | ✅ | ✅ | 完成 |
| 记账（收支 CRUD + 分类） | ✅ | ✅ | 完成 |
| 库存管理（主品 + 盘点 + 排序） | ✅ | ✅ | 完成* |
| 开关店（打卡 + 交接 + 照片） | ✅ | ✅ | 完成 |
| 工资管理（生成 + 确认 + 发放） | ✅ | ✅ | 完成 |
| 分红管理（创建 + 归档 + 记账） | ✅ | ✅ | 完成 |
| 报表（日报/周报/月报/年报） | ✅ | ✅ | 完成 |
| 仪表盘（汇总 + 趋势 + 对比） | ✅ | ✅ | 完成 |
| 通知（站内 + PushPlus + Server酱 + 企业微信） | ✅ | ✅ | 完成 |
| 操作日志（筛选 + 搜索 + JSON diff） | ✅ | ✅ | 完成 |
| 系统管理（备份/恢复/升级/清理） | ✅ | ✅ | 完成 |
| 健康证管理（OCR 识别） | ✅ | ✅ | 完成 |
| PWA 支持 | ✅ | ✅ | 完成 |
| 自定义分类管理 | ✅ | ✅ | 完成 |

*注：库存排序因 API 不匹配（PUT vs POST）当前不可用。

### 5.2 功能缺失

#### 生产环境所需功能

| 缺失功能 | 严重程度 | 说明 |
|---------|---------|------|
| **全局管理员用户管理页面** | HIGH | 后端 `/users` API 已有完整 CRUD，但无对应的前端页面。管理员只能通过店铺员工页面管理用户 |
| **数据导出（Excel/CSV）** | MEDIUM | 无记账、工资、报表数据导出能力，财务交接困难 |
| **收据/发票附件** | MEDIUM | 记账记录无附件支持（小票照片、发票），审计困难 |
| **软删除/归档** | MEDIUM | 店铺删除为硬删除（级联删除全部数据），无"暂停"选项 |
| **审批流程** | MEDIUM | 工资确认仅管理员操作但无多级审批，记账无审核流 |
| **双因素认证** | MEDIUM | 仅密码认证，无 2FA、登录历史 |
| **税务计算** | MEDIUM | 工资无个税扣除，分红无税款代扣 |
| **预算/预测** | LOW | 无按分类设置预算、实际 vs 计划对比 |
| **定时/自动记账** | LOW | 无周期性支出支持（房租、水电等） |
| **多语言** | LOW | 全中文硬编码，无 i18n 框架 |
| **跨店铺操作** | LOW | 无法在店铺间转移库存或调拨员工 |

#### 前端未消费的后端 API

| API | 说明 |
|-----|------|
| `GET /handovers` | `StoreShiftsPage.tsx` 直接使用 `/shifts` 数据，未调用此端点 |
| `GET /reports` (静态报表文件) | 无前端页面展示 |
| `DELETE /notifications/:id` | 后端存在但前端未暴露删除按钮 |

### 5.3 前后端对齐问题

| 问题 | 前端 | 后端 |
|------|------|------|
| 库存排序方法 | `PUT /inventory/items/reorder` | `POST /inventory/items/reorder` |
| 库存排序请求体 | `{ ids: [...] }` | `{ order: [{id, sort_order}] }` |
| 通知类型筛选 | `?type=xxx` | 后端忽略此参数，未实现 |
| Entries 列表键名 | `d.entries \|\| d.data` | 返回 `{ data: [...] }` |

### 5.4 UX 问题

#### 缺失状态

| 状态 | 涉及页面 |
|------|---------|
| 加载状态缺失 | `StoreShiftsPage`（提交时）、`StoreDividendsPage`（归档时）、`DashboardPage`（无骨架屏） |
| 错误状态处理不当 | `StoreOverviewPage` 静默 `catch(() => {})`、多个页面用 `alert()` |
| 操作反馈不一致 | 混用 `showToast()`、`alert()`、静默忽略三种模式 |

#### 其他 UX 问题

| 问题 | 说明 |
|------|------|
| `location.reload()` | `StoreShiftsPage` 开关店后整页刷新，丢失滚动位置和状态 |
| 无表单离开保护 | 记账、工资等编辑中导航离开无"未保存更改"警告 |
| 分页组件不统一 | `StoreEntriesPage` 用 `<Pagination>`，`NotificationsPage` 用内联按钮 |
| 无离线指示器 | PWA 无离线检测和缓存数据标识 |
| 无回到顶部 | 长列表（记账、日志、库存）无快速回顶功能 |

---

## 六、数据库与 API 设计审查

### 6.1 数据库层

#### Schema 设计问题

| 问题 | 严重程度 | 说明 |
|------|---------|------|
| 无 FOREIGN KEY 约束 | HIGH | 所有表使用 `TEXT` 而非 `REFERENCES`，完整性完全依赖应用代码 |
| TEXT 存储日期 | MEDIUM | 所有 `date`/`created_at` 为 TEXT 类型，日期运算困难 |
| 角色/状态无 CHECK | MEDIUM | 可插入任意字符串 |
| photos 以 JSON 文本存储 | MEDIUM | 无数据库层 JSON 校验 |
| notification_settings 单例模式 | LOW | `id=1` 作为单例行，模式脆弱 |
| inventory_items 与 inventory_check_items 功能重叠 | MEDIUM | 疑似遗留冗余 |

#### 迁移系统

当前迁移采用追加式 `ALTER TABLE ADD COLUMN` + try/catch 静默错误：

```ts
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* 全部静默 */ }
}
```

**缺失：**
- 迁移版本号
- 回滚机制
- 迁移历史记录表
- 区分"列已存在"与其他错误

#### 连接管理

- `better-sqlite3` 为单连接同步驱动，适合 SQLite 场景
- WAL 模式正确启用
- `dbRunWithRetry` 处理 SQLITE_BUSY，但使用忙等待（`while (Date.now() < end) {}`）阻塞事件循环

#### 事务使用

- 种子数据正确使用 `db.transaction()` ✅
- **路由处理器中无任何事务使用** ❌ — 这是数据完整性最大的风险

### 6.2 API 设计

#### 端点清单

| 路由文件 | 端点数量 | 方法 |
|---------|---------|------|
| `auth.ts` | 3 | POST, GET, PUT |
| `stores.ts` | 15+ | GET, POST, PUT, DELETE |
| `entries.ts` | 5 | GET, POST, PUT, DELETE |
| `categories.ts` | 4 | GET, POST, PUT, DELETE |
| `users.ts` | 4 | GET, POST, PUT, DELETE |
| `inventory.ts` | 10+ | GET, POST, PUT, DELETE |
| `shifts.ts` | 5 | GET, POST |
| `dividends.ts` | 5 | GET, POST, PUT, DELETE |
| `payroll.ts` | 6 | GET, POST, PUT, DELETE |
| `report.ts` | 1 | GET |
| `reports.ts` | 2 | GET |
| `notifications.ts` | 6 | GET, POST, PUT, DELETE |
| `system.ts` | 10+ | GET, POST, PUT, DELETE |
| `logs.ts` | 1 | GET |
| `dashboard.ts` | 2 | GET |
| `health-cert.ts` | 5 | GET, POST, PUT |
| `upload.ts` | 2 | POST, DELETE |
| `handovers.ts` | 1 | GET |

#### RESTful 规范问题

| 问题 | 示例 |
|------|------|
| 动作端点用 PUT | `PUT /:id/archive` 应为 `POST /:id/archive` |
| 批量操作用 PUT | `PUT /read-all` 应为 `POST /read-all` |
| 非标准路径 | `PUT /save` 应为 `PUT /` 或 `PATCH /` |
| 冗余路由 | `POST /`、`POST /open`、`POST /close` 逻辑几乎相同 |

#### HTTP 状态码

**整体正确**：400 验证错误、401 认证失败、403 授权失败、404 未找到、500 服务器错误 ✅

**问题：** 部分 DELETE 操作不检查记录是否存在，静默成功。

#### 筛选与排序

**做得好的：**
- `entries.ts`：支持 `date`、`dateFrom`、`dateTo`、`month`、`year`、`week`、`period` 多种筛选
- `logs.ts`：支持 `storeId`、`action`、`dateFrom`、`dateTo`、`search` 筛选

**缺失的：**
- `users.ts`：仅 `storeId` 筛选，无搜索、角色筛选、状态筛选
- `payroll.ts`：无状态筛选（draft/confirmed）
- `dividends.ts`：无状态筛选（draft/archived）
- `notifications.ts`：无类型筛选
- 所有端点：无客户端可控排序（全部硬编码 ORDER BY）

---

## 七、基础设施与运维审查

### 7.1 Docker

#### Dockerfile

| 问题 | 说明 |
|------|------|
| 非多阶段构建 | 构建工具（python3、make、g++）在同一层安装后清除，不如多阶段干净 |
| 以 root 运行 | 无 `USER` 指令 |
| 运行时编译 TS | `CMD` 使用 `tsx` 实时编译，增加启动延迟 |
| ✅ 层缓存优化 | `npm install` 在源码复制之前执行 |

#### docker-compose.yml

| 问题 | 说明 |
|------|------|
| 默认 JWT 密钥 | `please-change-this-secret` 已在公开仓库 |
| 无资源限制 | 无 `mem_limit`、`cpus` |
| 无日志轮转 | 无 `logging` 配置，日志可无限增长 |
| ✅ 卷挂载正确 | data、uploads、backups、web-dist 独立持久化 |

#### .dockerignore

应额外排除 `backups/`、`uploads/`、`*.db` 文件，防止数据意外包含在构建上下文中。

### 7.2 CI/CD

**位置：** `.github/workflows/build-deploy.yml`

| 问题 | 说明 |
|------|------|
| 仅构建前端 | 仅运行 `npx vite build`，后端 TypeScript 从未在 CI 中类型检查 |
| 无测试步骤 | 零测试执行 |
| 无安全扫描 | 无 `npm audit`、SAST、容器扫描 |
| 无缓存 | 每次从零安装依赖 |
| 使用 `--legacy-peer-deps` | 抑制依赖冲突警告 |

### 7.3 构建与升级脚本

| 脚本 | 评价 |
|------|------|
| `build-upgrade.cjs` | ✅ 优秀：esbuild 预验证 + 智能排除列表 + 版本同步 |
| `post-upgrade.cjs` | ✅ 良好：npm install 失败回退 + 超时保护 + 清理逻辑 |
| `build-upgrade.js` | ⚠️ 遗留：硬编码绝对路径，应删除或修复 |

### 7.4 运维模块

| 模块 | 评价 |
|------|------|
| `health-check-scheduler.ts` | ✅ 30天预警 + 每日过期提醒。⚠️ 无通知去重、setInterval 会漂移 |
| `report-scheduler.ts` | ⚠️ 与 setupCron 重复、手动时区计算脆弱、轮询效率低 |
| `oplog.ts` | ✅ 审计日志完整。⚠️ 无限增长、每次写入前同步查询用户名 |
| `event-bus.ts` | ✅ 智能心跳管理 + 死连接清理。⚠️ 无 SSE 重认证、无按店铺过滤事件 |
| 自动备份 | ✅ WAL checkpoint + 保留限制。⚠️ 不含 WAL/SHM 文件、无备份验证 |

### 7.5 PWA 质量

| 项目 | 评价 |
|------|------|
| Service Worker | ✅ `autoUpdate` + Workbox 运行时缓存 |
| 缓存策略 | ✅ API `NetworkFirst` 5分钟TTL |
| Manifest | ✅ 图标、主题色、standalone 模式 |
| ⚠️ 无离线回退页面 | 导航请求失败时显示浏览器错误 |
| ⚠️ logo.png 1.19MB | 过大，影响 PWA 初始加载 |
| ⚠️ maskable 图标 | 与普通图标使用同一文件，缺少安全区域内边距 |

---

## 八、修复优先级路线图

### 🔴 P0 — 立即修复（安全 / 数据完整性）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| 1 | `health-cert.ts` 添加 `safePath()` 校验 | 任意文件读取 | 小 |
| 2 | 多表写操作包裹 `db.transaction()` | 数据损坏 | 中 |
| 3 | CORS 要求显式配置，不允许默认通配符 | 跨域攻击 | 小 |
| 4 | Docker Compose 移除默认 JWT 密钥 | 令牌伪造 | 小 |
| 5 | Docker 添加非 root 用户 | 容器安全 | 小 |
| 6 | 店铺删除补全级联清理 | 数据残留 | 中 |
| 7 | 健康证上传添加文件类型过滤 | 存储型 XSS | 小 |

### 🟠 P1 — 本周修复（关键 Bug + 安全加固）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| 8 | 删除重复的报告定时器 | 报告双发 | 小 |
| 9 | 前端 SSE `useSSE()` 去重 | 双重连接 | 小 |
| 10 | 分红比例显示 bug 修复 | 显示错误 | 小 |
| 11 | 库存排序 API 方法和请求体对齐 | 功能不可用 | 小 |
| 12 | 员工角色设置添加越权校验 | 权限提升 | 小 |
| 13 | 添加输入验证（推荐 Zod） | 注入风险 | 中 |
| 14 | 健康证自验证漏洞修复 | 越权操作 | 小 |
| 15 | 添加 Error Boundary | 白屏崩溃 | 小 |
| 16 | 周报同比计算修复 | 数据错误 | 小 |

### 🟡 P2 — 本月修复（架构改善）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| 17 | 后端开启 `strict: true` | 类型安全 | 大 |
| 18 | 创建共享类型包消除 `any` | 代码质量 | 大 |
| 19 | 配置 ESLint | 代码规范 | 中 |
| 20 | 添加基础测试覆盖 | 回归风险 | 大 |
| 21 | CI 添加 `tsc --noEmit` + 测试 | 部署安全 | 中 |
| 22 | `alert()/confirm()` 替换为 Toast/Modal | 用户体验 | 中 |
| 23 | 提取通用数据请求 hook | 代码重复 | 中 |
| 24 | 统一 API 响应格式 | 开发体验 | 大 |
| 25 | N+1 查询优化 | 性能 | 中 |
| 26 | 构建管理员用户管理页面 | 功能缺失 | 中 |

### 🟢 P3 — 后续迭代（长期优化）

| # | 问题 | 影响 | 工作量 |
|---|------|------|--------|
| 27 | 请求日志中间件 | 可观测性 | 小 |
| 28 | OpLog 轮转策略 | 磁盘管理 | 小 |
| 29 | 数据导出功能（Excel/CSV） | 业务需求 | 中 |
| 30 | 无障碍改进（ARIA、focus、对比度） | 可访问性 | 大 |
| 31 | 多语言支持框架 | 国际化 | 大 |
| 32 | Token 改用 HttpOnly Cookie | 安全加固 | 中 |
| 33 | 收据/发票附件功能 | 审计需求 | 中 |
| 34 | Docker 多阶段构建 | 镜像优化 | 中 |

---

## 九、总结

### 项目优势

这是一个**功能非常完整**的小型连锁店管理系统。核心业务链路——开店 → 记账 → 工资 → 分红 → 报表——全部打通。通知系统（4 渠道）、操作审计、自动备份/恢复、PWA、健康证 OCR 等基础设施齐全。代码组织清晰，文档完整度远超同规模项目。RBAC 体系、SSE 实时推送、SQLite WAL 模式配置、备份恢复回滚等设计体现了生产环境意识。

### 主要风险

风险集中在三个维度：

**1. 安全防护有明显短板**
- 路径穿越、CORS 通配、弱默认密码构成直接攻击面
- 无输入验证框架、CSP 形同虚设、Token 存储不安全
- 文件上传过滤不严、升级机制可被利用执行任意代码

**2. 数据完整性缺乏保障**
- 关键业务操作（工资确认、分红归档、店铺删除）无事务保护
- 迁移系统脆弱，无法追踪或回滚
- 零测试覆盖，对财务系统来说风险极高

**3. 代码质量有提升空间**
- TypeScript strict 关闭，`any` 泛滥（290+ 处）
- `alert()/confirm()` 遍布前端，PWA 体验受损
- 大量代码重复，缺少共享抽象层
- ESLint 安装但未配置，CI 无代码质量门禁

### 评分

| 维度 | 评分（/10） | 说明 |
|------|-----------|------|
| 功能完整性 | **9** | 几乎所有预期功能已实现，少数缺失不影响核心使用 |
| 安全性 | **4** | 有基础安全意识但存在多个严重漏洞 |
| 代码质量 | **5** | 架构合理但类型安全和测试覆盖不足 |
| 数据库设计 | **6** | 索引和 WAL 配置优秀，但缺外键和事务保护 |
| API 设计 | **6** | RESTful 基本规范但一致性不足 |
| 前端架构 | **5** | 组件设计有亮点但缺少 Error Boundary 和状态抽象 |
| 基础设施 | **5** | Docker 可用但 CI/CD 和安全加固不足 |
| 开发体验 | **4** | 无测试、无 Lint、strict 关闭、文档不错 |
| **综合** | **5.5** | 功能出色的 v1.x 产品，需要一轮安全和质量加固才能达到生产级别 |

---

*本报告由 7 个并行审查维度综合生成，覆盖安全审计、后端代码质量、前端代码质量、数据库与 API 设计、功能完整性、代码规范、基础设施运维。*
