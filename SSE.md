# SSE（Server-Sent Events）技术文档

## 一、概述

SSE 是本项目实现实时数据推送的核心技术。用于以下场景：

- **通知角标实时更新** — 新通知到达时角标数字立即变化
- **数据同步** — 记账/盘点/进货/排班/工资/分红等数据变更后，其他在线用户页面自动刷新
- **服务器状态推送** — 服务重启后通知前端重新加载

## 二、架构

### 2.1 后端（Express）

```
客户端 → GET /api/sse → 建立长连接 → 服务端持续推送事件
```

**核心文件：**

| 文件 | 职责 |
|------|------|
| `apps/server/src/event-bus.ts` | SSE 事件总线，管理所有客户端连接，广播事件 |
| `apps/server/src/index.ts` | SSE 端点定义（/api/sse） |
| `apps/server/src/notify-trigger.ts` | 触发通知并通过 eventBus 广播 |
| `apps/server/src/routes/entries.ts` | 记账创建/修改/删除时调用 eventBus.broadcast() |

**SSE 端点流程：**

1. 客户端通过 `GET /api/sse` 建立连接（Cookie 或 Bearer Token 认证）
2. 服务端设置响应头：`Content-Type: text/event-stream`、`Cache-Control: no-cache`
3. 注册客户端到 EventBus
4. 发送初始 `connected` 事件
5. 发送 `sync` 事件（携带当前未读数 unreadCount）
6. 每 15 秒发送心跳（SSE 注释格式 `:heartbeat`）
7. 客户端断开时清理连接

**事件格式：**

```
event: data-change
data: {"type":"notification","action":"new","storeId":"store_001","data":{...},"unreadCount":5}

event: system
data: {"action":"server-ready","data":{}}
```

### 2.2 前端（React）

**核心文件：**

| 文件 | 职责 |
|------|------|
| `apps/web/src/lib/sse.ts` | SSE 连接管理（EventSource） |
| `apps/web/src/stores/notification.ts` | 通知角标状态（unreadCount） |
| `apps/web/src/stores/data-sync.ts` | 数据同步版本号（触发页面刷新） |
| `apps/web/src/components/ConnectionStatus.tsx` | SSE 连接状态指示灯（红/黄/绿） |
| `apps/web/src/layouts/BottomNav.tsx` | 底部导航栏（轮询兜底） |

**前端 SSE 流程：**

1. 页面加载 → `useSSE()` hook 触发 → 创建 EventSource 连接
2. 收到 `data-change` 事件 → 更新 unreadCount（角标）+ bumpGlobal/bumpStore（页面刷新）
3. 收到 `system` 事件 → 触发 server-ready 处理
4. 连接断开 → 3 秒后自动重连（EventSource 内置）
5. 兜底：BottomNav 每 30 秒轮询 unread-count API

## 三、SSE 事件类型

| 事件类型 | 触发时机 | 数据内容 |
|----------|----------|----------|
| `data-change` (notification) | 新通知创建 | unreadCount + 通知详情 |
| `data-change` (entry) | 记账创建/修改/删除 | storeId + entryId |
| `data-change` (inventory) | 盘点提交 | storeId + checkId |
| `data-change` (purchase) | 进货更新 | storeId + date |
| `data-change` (shift) | 排班变更 | storeId |
| `data-change` (payroll) | 工资变更 | storeId |
| `data-change` (dividend) | 分红变更 | storeId |
| `system` (server-ready) | 服务器重启完成 | 无 |
| `system` (upgrade-progress) | 升级进度 | step + message |

## 四、已知问题与修复历史

### 4.1 VitePWA Service Worker 缓存问题（v1.2.24 - v1.2.26）

**问题：** VitePWA 的 `injectManifest` 策略会把 `index.html` 和所有 JS 文件缓存到 Service Worker 的 precache 中。更新后浏览器仍然加载旧代码，SSE 新逻辑无法生效。

**表现：**
- 在线更新版本号已更新，但页面内容不变
- 控制台显示旧的 JS 文件名
- SSE 角标不更新，只靠 30 秒轮询

**尝试过的方案（均未彻底解决）：**
1. 在 index.html 添加内联脚本清理 SW → 被旧 SW 缓存的 HTML 阻止执行
2. 添加 force-sw-clear 插件 → VERSION 匹配逻辑在旧 HTML 中无法触发
3. 修改 SW 的 globPatterns 排除 HTML → VitePWA 仍会添加
4. 修改 main.tsx 添加 SW 清理逻辑 → 旧 main.tsx 不会被执行

**最终方案（v1.2.27）：**
- 移除 VitePWA 插件
- 创建最小化 `public/msl-sw.js`（仅处理推送通知，不缓存任何文件）
- 使用新路径 `/msl-sw.js` 避免与旧 SW 冲突
- main.tsx 每次加载时注销所有旧 SW、清除所有缓存、注册新 SW

### 4.2 fetch ReadableStream 流式缓冲问题（v1.2.24 - v1.2.26）

**问题：** 使用 `fetch` + `ReadableStream` 替代 `EventSource` 做 SSE，但浏览器对 ReadableStream 的小块数据有缓冲行为，导致事件不实时到达。

**表现：**
- Node.js 测试 SSE 延迟仅 168ms（正常）
- 浏览器中 `reader.read()` 不触发回调
- 控制台无 `[SSE] Event` 日志

**原因分析：**
- EventSource 是浏览器原生 SSE API，在底层处理流解析，事件立即触发
- fetch ReadableStream 给出原始字节流，浏览器可能缓冲小块数据
- Express 的 compression 中间件可能干扰流式响应
- 不同浏览器（Chrome/Firefox/Safari）缓冲行为不一致

**最终方案（v1.2.27）：**
- 改回 EventSource API
- 认证方式改用 httpOnly Cookie（EventSource 自动携带 cookie，不需要自定义 header）

### 4.3 event-bus.ts 缺失 db 导入（v1.2.24 - v1.2.26）

**问题：** `event-bus.ts` 的 `broadcast()` 方法中查询未读数的 `db.prepare(...)` 抛出 `ReferenceError: db is not defined`，被 `try-catch` 静默吞掉，导致 SSE 事件永远不携带 `unreadCount`。

**表现：**
- SSE 事件数据中没有 unreadCount 字段
- 前端无法从 SSE 事件直接更新角标
- 角标只能靠 30 秒轮询更新

**修复：** 在 `event-bus.ts` 头部添加 `import db from './db.js'`

### 4.4 SSE 连接循环重连问题（v1.2.24 - v1.2.26）

**问题：** 服务端 `closeUserConnections()` 在新连接到来时关闭旧连接，触发客户端重连，重连又触发关闭，形成无限循环。

**表现：**
- Docker 日志中 SSE 客户端 ID 快速递增（client_1 → client_2 → ... → client_37）
- 连接状态指示灯常红

**修复：** 移除 SSE 端点中的 `closeUserConnections()` 调用

### 4.5 React 19 removeChild 错误（当前未解决）

**问题：** React 19 的 DOM 协调过程中出现 `NotFoundError: Failed to execute 'removeChild' on 'Node'`，导致 ErrorBoundary 反复捕获错误，页面进入错误循环。

**表现：**
- 控制台出现大量 removeChild 错误堆栈
- ErrorBoundary 反复显示错误页面
- SSE 连接无法建立（onopen 回调无法执行）

**影响：** 这是当前 SSE 角标无法实时更新的直接原因。EventSource 代码本身是正确的（Node.js 测试通过），但页面崩溃导致事件循环被阻塞。

**已尝试：**
- 移除 StrictMode → 未解决
- 改进 ErrorBoundary（添加错误计数防循环） → 缓解但未根治

**待排查：**
- 确认是哪个组件触发了 removeChild 错误
- 可能与 Suspense + lazy 加载 + react-router-dom 的组合有关
- 需要在实际手机端测试（F12 模拟器可能有差异）

## 五、当前状态（v1.2.27）

| 功能 | 状态 | 说明 |
|------|------|------|
| SSE 连接建立 | ✅ 正常 | EventSource 连接成功，服务器日志确认 |
| SSE 事件推送 | ✅ 正常 | 服务端正确广播事件，携带 unreadCount |
| 角标实时更新 | ⚠️ 受阻 | removeChild 错误阻塞事件循环 |
| 数据自动刷新 | ⚠️ 受阻 | 同上 |
| 30 秒轮询兜底 | ✅ 正常 | 角标最多延迟 30 秒更新 |
| 浏览器推送通知 | ✅ 正常 | Web Push 通道独立于 SSE |
| PWA 更新清理 | ✅ 正常 | msl-sw.js + 启动时清理旧 SW |
| 在线升级 | ✅ 正常 | 进度实时显示，server-ready 触发完成 |

## 六、后续优化方向

1. **解决 removeChild 错误** — 这是当前阻塞 SSE 实时更新的根因
2. **考虑 WebSocket 替代 SSE** — 双向通信，更可靠，但改动较大
3. **增加 SSE 重连退避策略** — 当前固定 3 秒，应改为指数退避
4. **SSE 事件压缩** — 减少不必要的字段，降低带宽
5. **多标签页共享连接** — 使用 BroadcastChannel 在标签页间共享 SSE 连接
