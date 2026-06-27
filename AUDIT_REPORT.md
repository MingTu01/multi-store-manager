# Multi Shop Link - 全面审计报告

> **项目**：Multi Shop Link 多门店管理系统
> **版本**：v1.2.27
> **审计日期**：2026-06-27
> **审计范围**：安全、实用、代码整洁、逻辑、框架、边界、权限、性能、适配性 + SSE 专项

---

## 综合评分

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整度 | 9/10 | 功能丰富，覆盖门店管理全流程 |
| 安全性 | 5.5/10 | 核心防线到位，但缺少输入净化和部分中间件覆盖 |
| 代码整洁度 | 4/10 | 大量重复代码，any 泛滥，无类型约束 |
| 架构设计 | 6.5/10 | 前后端分离合理，但缺少抽象层和缓存层 |
| 逻辑正确性 | 6/10 | 核心业务逻辑正确，但存在边界条件和竞态问题 |
| 性能 | 5/10 | 无缓存层，N+1 查询，busy-wait 阻塞 |
| 测试覆盖 | 1/10 | 零测试覆盖，财务系统最高风险缺失 |
| SSE 实时通信 | 5.5/10 | 架构合理但存在双重心跳、N+1 查询、React 19 兼容问题 |
| **综合** | **5.3/10** | **功能优秀，工程质量需要重点加固** |
---

## 一、严重问题（必须立即修复）

### 1.1 存储型 XSS 漏洞

**严重程度**：高
**位置**：全局 - note、store name、category name 等所有用户输入文本字段
**现状**：用户提交的 script 标签被原样存储并返回，pentest 报告确认
**影响**：攻击者可窃取其他用户的 session、执行恶意操作

**修复方案**：
- 新建 apps/server/src/sanitize.ts，使用 sanitize-html 库
- 在所有写入数据库前调用 sanitizeText()
- 前端输出时使用 React 的自动转义（已是 JSX 默认行为）

### 1.2 SSRF 风险 - 企业微信代理 URL

**严重程度**：高
**位置**：apps/server/src/notify.ts - sendWeCom()
**现状**：wecom_proxy_url 用户可控，可设为内网地址获取云服务器元数据

**修复方案**：
- 添加 URL 白名单校验
- 禁止内网 IP（10.x / 172.16-31.x / 192.168.x / 169.254.x）
- 用 new URL() 解析并校验协议（仅允许 http/https）

### 1.3 React 19 removeChild 错误（阻塞 SSE）

**严重程度**：高
**现状**：React 19 DOM 协调过程中 NotFoundError，导致 ErrorBoundary 反复捕获错误，SSE 事件无法处理，角标无法实时更新
**影响**：SSE 实时更新功能完全失效，退化为 30 秒轮询

**修复方案**：
1. 定位触发 removeChild 的具体组件（通常是 Suspense + lazy + router 组合）
2. 在 ErrorBoundary 中添加错误计数防循环 + 自动恢复
3. 考虑降级 React 18 或等待 React 19 补丁

### 1.4 /api/categories 路由缺少认证

**严重程度**：高
**位置**：apps/server/src/index.ts 路由挂载
**现状**：pentest 报告确认 /api/categories 返回 404 而非 401，说明未挂载 authMiddleware

---

## 二、中等问题（建议 1 个月内修复）

### 2.1 安全类

| 编号 | 问题 | 位置 | 修复方案 |
|------|------|------|----------|
| S1 | 无 Token 黑名单 - 登出后 token 4h 内仍有效 | auth.ts | 用 Redis 或内存 Set 存储已注销的 jti |
| S2 | CSP unsafe-eval 削弱 XSS 防护 | index.ts CSP | 移除 unsafe-eval，排查哪个库需要 |
| S3 | 文件上传无 magic bytes 校验 | routes/upload.ts | 用 file-type 库校验文件头 |
| S4 | 通知加密密钥硬编码默认值 | notify.ts | 生产环境强制配置 NOTIFY_ENC_KEY |
| S5 | 门店归属校验用姓名匹配可被同名股东绕过 | store-access.ts | 改用 user_id 匹配 |
| S6 | upload delete 无角色校验 | routes/upload.ts | 添加角色+归属校验 |
| S7 | 登录失败未记录审计日志 | routes/auth.ts | 登录失败时写入 op_logs |
| S8 | 备份文件明文存储 | system.ts | 备份文件加密或限制目录权限 |

### 2.2 代码质量类

| 编号 | 问题 | 位置 | 修复方案 |
|------|------|------|----------|
| C1 | TypeScript strict: false | tsconfig.json | 分阶段开启 strict |
| C2 | as any 泛滥 (290+处) | 全局 | 定义核心接口，逐步消除 |
| C3 | 零测试覆盖 | 项目根 | 至少覆盖工资、分红、认证核心逻辑 |
| C4 | 无 ESLint 配置 | 项目根 | 添加 ESLint + Prettier |
| C5 | import/require 混用 | index.ts, db.ts | 统一使用 ESM import |
| C6 | 权限检查重复 30+ 处 | 全局路由 | 提取为 requireRole 中间件 |
---

## 三、SSE 专项深度分析

### 3.1 SSE 架构概览

`
客户端 EventSource -> GET /api/sse -> authMiddleware -> eventBus.addClient()
                                                        |
                              eventBus.broadcast() <-- notify-trigger / routes
                                                        |
                              遍历 clients -> 查 unreadCount -> res.write()
`

### 3.2 SSE 严重问题

#### 3.2.1 双重心跳机制冲突

**位置**：index.ts (15s) + event-bus.ts (30s)

| 来源 | 间隔 | 格式 | 作用域 |
|------|------|------|--------|
| index.ts | 15秒 | data heartbeat JSON | 每连接独立 setInterval |
| event-bus.ts | 30秒 | SSE 注释格式 :heartbeat | 全局共享 setInterval |

**问题**：
- 两个心跳同时运行，浪费资源
- event-bus 心跳用 SSE 注释格式，客户端 onmessage 收不到
- event-bus 心跳在所有客户端断开后停止，但 index.ts 的每个连接心跳独立运行

**修复方案**：移除 event-bus.ts 中的 startHeartbeat()/stopHeartbeat()，只保留 index.ts 的心跳

#### 3.2.2 broadcast() N+1 查询

**位置**：event-bus.ts - broadcast()

当前实现：每次 broadcast 对每个客户端查一次 DB。10 个在线用户 = 10 次 DB 查询/每次数据变更

**修复方案**：
- 批量查询所有在线用户的 unreadCount
- 用 IN (...) 一次查完，结果存 Map<userId, count>
- 预编译 db.prepare() 为模块级常量复用

#### 3.2.3 双重广播问题

**位置**：notify-trigger.ts + routes/entries.ts

一次记账操作产生两次 SSE 广播：
1. triggerNotification() -> eventBus.broadcast({ type: notification })
2. routes/entries.ts -> eventBus.broadcast({ type: entry })

**修复方案**：合并为一次广播，或用防抖机制（debounce 100ms）合并同一批次事件

### 3.3 SSE 中等问题

| 编号 | 问题 | 修复方案 |
|------|------|----------|
| SSE-1 | 固定 3 秒重连，服务端宕机时产生大量无效请求 | 改为指数退避：3s -> 6s -> 12s -> 30s -> 60s |
| SSE-2 | dead client 心跳不清理，心跳写入失败不标记清理 | 心跳写入失败时也加入 dead 列表 |
| SSE-3 | db.prepare() 未预编译，每次 broadcast 创建新 Statement | 预编译为模块级常量复用 |
| SSE-4 | closeUserConnections() 方法仍存在，虽不调用但易误用 | 删除该方法 |
| SSE-5 | JSON 重复序列化，先 stringify 再对每个客户端重新 stringify | 只在需要 unreadCount 时才重新序列化 |
| SSE-6 | 无事件类型过滤，所有客户端收到所有事件 | 按 storeId 过滤，只推送相关门店的事件 |

### 3.4 SSE 当前状态总结

| 功能 | 状态 | 说明 |
|------|------|------|
| SSE 连接建立 | 正常 | EventSource 连接成功 |
| SSE 事件推送 | 正常 | 服务端正确广播，携带 unreadCount |
| 角标实时更新 | 受阻 | React 19 removeChild 错误阻塞事件循环 |
| 数据自动刷新 | 受阻 | 同上 |
| 30 秒轮询兜底 | 正常 | 角标最多延迟 30 秒 |
| 浏览器推送通知 | 正常 | Web Push 通道独立于 SSE |
| 心跳机制 | 冗余 | 双重心跳需合并 |
---

## 四、架构与框架分析

### 4.1 架构优点

- 前后端分离（apps/server + apps/web）
- RESTful API 设计规范
- 角色权限五级分层清晰
- Docker 容器化部署
- SSE + Web Push + 外部推送三通道通知

### 4.2 架构缺陷

| 编号 | 问题 | 影响 | 修复方案 |
|------|------|------|----------|
| F1 | 无缓存层 | 所有请求直走 SQLite | 添加 LRU 缓存 |
| F2 | 无结构化日志 | 生产环境无法排查问题 | 引入 pino，添加 requestId |
| F3 | 无性能监控 | 无法发现慢查询和瓶颈 | 添加请求耗时中间件 |
| F4 | 无错误码体系 | 前端靠字符串匹配错误 | 创建 AppError 类 + 错误码 |
| F5 | N+1 查询 | payroll/items 循环查询 | 用 JOIN 替代 |
| F6 | busy-wait 阻塞 | dbRunWithRetry 的 while 循环 | 改用 db.pragma(busy_timeout) |
| F7 | 无 graceful shutdown | uncaughtException 直接 exit | 关闭 DB、通知 SSE 客户端 |
| F8 | 报表生成重复 | 同一数据查询 6 遍 | 提取公共查询函数 |

---

## 五、边界条件与逻辑问题

| 编号 | 问题 | 位置 | 修复方案 |
|------|------|------|----------|
| B1 | 金额无精度控制，浮点数运算可能导致精度丢失 | entries.ts | 使用整数分（cent）存储或 toFixed(2) |
| B2 | 并发记账无去重，快速双击提交产生重复记录 | routes/entries.ts | 前端防抖 + 后端幂等键 |
| B3 | 时区硬编码 Asia/Shanghai | index.ts | 改为可配置 |
| B4 | SQLite 并发写入 SQLITE_BUSY 风险 | db.ts | busy_timeout pragma 替代 busy-wait |
| B5 | note 字段无长度限制 | entries.ts | 添加 maxLength 验证 |
| B6 | 手机号验证不一致，仅 STAFF 强制格式 | routes/auth.ts | 统一所有角色的手机号验证 |
| B7 | 版本号递增手动 | package.json | 自动化版本管理 |

---

## 六、性能分析

### 6.1 当前性能瓶颈

| 瓶颈 | 位置 | 影响 | 优化方案 |
|------|------|------|----------|
| authMiddleware 每次查 DB | auth.ts | 高频操作 | 用户信息缓存 TTL 60s |
| broadcast N+1 查询 | event-bus.ts | 每次事件 N 次 DB | 批量查询 |
| 仪表盘全表聚合 | dashboard.ts | 数据量增长后变慢 | 缓存 + 预计算 |
| 报表生成全表扫描 | notify.ts | 定时任务阻塞 | 缓存 + 异步 |
| dbRunWithRetry busy-wait | db.ts | 阻塞事件循环 | busy_timeout pragma |

### 6.2 前端性能

| 问题 | 位置 | 优化方案 |
|------|------|----------|
| SSE 事件触发 4-6 次 invalidateCache | sse.ts | 合并缓存失效 |
| 大列表无虚拟滚动 | 部分页面 | 已有 VirtualList 组件但未全面使用 |
| 图表库 416KB | vendor-charts | 按需加载 |
---

## 七、适配性分析

### 7.1 浏览器兼容性

| 特性 | 兼容性 | 说明 |
|------|--------|------|
| EventSource | 全平台 | SSE 核心 API |
| PWA / Service Worker | 主流浏览器 | Chrome/Edge/Firefox/Safari |
| Web Push (VAPID) | iOS 16.4+ | iOS 16 以下不支持 |
| CSS Tailwind 4 | 现代浏览器 | 不支持 IE11 |
| React 19 | 现代浏览器 | 但有 removeChild bug |

### 7.2 部署适配

| 场景 | 支持度 | 说明 |
|------|--------|------|
| Docker 部署 | 完善 | Dockerfile + docker-compose |
| 本地开发 | 良好 | tsx 直接运行 |
| 在线升级 | 有机制 | 但升级链路曾多次出 bug |
| ZIP 升级 | 有机制 | 需注意 BOM/CRLF |
| 多实例部署 | 不支持 | 进程内 Map 存储 SSE 客户端，无法共享 |

---

## 八、优化方案优先级排序

### P0 - 紧急（本周）

1. **添加输入净化中间件** - 防止存储型 XSS
2. **SSRF 防护** - webhook URL 白名单校验
3. **修复 /api/categories 认证缺失**
4. **解决 React 19 removeChild 错误** - SSE 恢复实时更新

### P1 - 重要（本月）

5. 创建 error-handler.ts - 统一 AppError + 错误码 + 生产环境脱敏
6. 创建 logger.ts - 引入 pino，结构化日志 + requestId
7. 修复 SSE 双重心跳 - 移除 event-bus 冗余心跳
8. 优化 broadcast() N+1 查询 - 批量查询 unreadCount
9. SSE 重连指数退避 - 3s -> 6s -> 12s -> 30s
10. dbRunWithRetry 改用 busy_timeout pragma
11. 文件上传 magic bytes 校验
12. Token 黑名单机制

### P2 - 改进（1-2 个月）

13. 逐步开启 TypeScript strict
14. 添加基础测试覆盖 - 工资、分红、认证
15. 提取权限中间件 - 消除 30+ 处重复
16. 添加 LRU 缓存层 - 用户信息、门店设置
17. N+1 查询优化 - payroll/items JOIN
18. 添加 ESLint + Prettier
19. Graceful shutdown
20. 多标签页 BroadcastChannel 共享 SSE

---

## 九、已修复问题（确认）

| 问题 | 版本 | 状态 |
|------|------|------|
| 默认密码 123456 | v1.2.27 | 已修复（随机密码） |
| health-cert 路径穿越 | v1.2.27 | 已修复 |
| CORS 默认通配符 | v1.2.27 | 部分修复 |
| 多表写操作无事务 | v1.2.27 | 部分修复 |
| VitePWA SW 缓存问题 | v1.2.27 | 已修复 |
| fetch ReadableStream 缓冲 | v1.2.27 | 已修复 |
| event-bus 缺失 db 导入 | v1.2.27 | 已修复 |
| SSE 连接循环重连 | v1.2.27 | 已修复 |
| httpOnly Cookie 认证 | v1.2.27 | 已修复 |
| execSync 命令注入 | v1.2.27 | 已修复 |
| ZIP SHA256 校验 | v1.2.27 | 已修复 |
| SQL 参数化（notifications） | v1.2.27 | 已修复 |

---

## 十、安全防线盘点

### 已到位的安全措施

- 参数化 SQL 查询（better-sqlite3）
- bcrypt 密码哈希（cost factor 10）
- httpOnly + Secure + SameSite Cookie
- CSP nonce（每请求随机）
- X-Frame-Options / X-Content-Type-Options
- 全局 API 速率限制（100/min/IP）
- 登录速率限制（5/min/IP）
- 角色五级权限控制
- 门店级别访问控制
- 操作审计日志
- 文件上传白名单 + 大小限制
- CORS 可配置
- JWT 密码修改后自动失效
- AES-256-GCM 推送 token 加密

### 缺失的安全措施

- 输入净化层（XSS 防护）
- SSRF 防护（webhook URL 校验）
- Token 黑名单（登出即时失效）
- 文件魔数校验
- CSRF Token（仅依赖 SameSite）
- Origin/Referer 校验
- 登录失败审计
- 备份文件加密

---

## 十一、代码异味与技术债务

| 类型 | 数量 | 示例 |
|------|------|------|
| as any 断言 | 290+ | 几乎每个 DB 查询结果都 as any |
| 重复 try-catch | 40+ | 每个路由 handler 都有相同 catch 块 |
| 重复权限检查 | 30+ | if (!isManagerOrAbove) return 403 |
| 混合 import/require | 1+ | index.ts 中 require(event-bus) |
| 乱码注释 | 多处 | index.ts 中 UTF-8 编码的中文注释被损坏 |
| 硬编码魔法值 | 多处 | 超时时间、限制数量等散落各处 |

---

*报告生成时间：2026-06-27*
*审计方法：静态代码分析 + 渗透测试报告 + 架构审查 + 4 并行子代理深度分析*
