# Multi Shop Link 完整修复计划

> 基于 2026-06-27 全面审计报告，按优先级分阶段执行
> 当前版本：v1.2.27 -> 目标版本：v1.3.0

---

## 阶段一：P0 紧急修复（本周，v1.2.28）

### 1.1 添加输入净化层 - 防止存储型 XSS

**问题**：note、store name、category name 等字段未净化，script 标签被原样存储
**文件**：新建 apps/server/src/sanitize.ts + 修改所有路由中写入数据库前的文本字段处理

**步骤**：
1. npm install sanitize-html + @types/sanitize-html
2. 创建 sanitize.ts，导出 sanitizeText() 和 sanitizeNote()
3. 在以下路由的 POST/PUT 处理中添加净化调用：
   - routes/entries.ts - note 字段
   - routes/stores.ts - name、address 字段
   - routes/categories.ts - name 字段
   - routes/users.ts - name、address、job_title 字段
   - routes/handovers.ts - note 字段
   - routes/inventory.ts - product_name、note 字段
   - routes/purchase.ts - item name 字段

**验证**：提交 script 标签作为 note，确认存储和返回时被转义

---

### 1.2 SSRF 防护 - webhook URL 白名单校验

**问题**：企业微信 wecom_proxy_url 用户可控，可设为内网地址
**文件**：新建 apps/server/src/lib/network.ts + 修改 apps/server/src/notify.ts

**步骤**：
1. 创建 network.ts，实现 isPrivateIp(hostname) 和 validateWebhookUrl(url)
2. 在 notify.ts 的 sendWeCom() 中调用校验
3. 在 routes/system.ts 的推送设置保存接口中校验所有 webhook URL

**验证**：尝试设置 http://169.254.169.254/ 作为 proxy_url，确认被拒绝
---

### 1.3 修复 /api/categories 认证缺失

**问题**：pentest 确认 /api/categories 返回 404 而非 401
**文件**：apps/server/src/index.ts
**步骤**：检查 categoriesRouter 挂载行是否包含 authMiddleware，如缺失则添加
**验证**：无 token 访问 /api/categories，确认返回 401

### 1.4 修复 index.ts 乱码注释

**问题**：UTF-8 中文注释被损坏
**文件**：apps/server/src/index.ts
**步骤**：检查所有乱码注释行，恢复为正确的中文注释，确保文件为 UTF-8 无 BOM

### 1.5 修复 require(crypto) 混用

**问题**：ESM 模块中使用 require 语法
**文件**：apps/server/src/db.ts
**步骤**：将 const crypto = require(crypto) 改为 import crypto from crypto

---

## 阶段二：P1 重要修复（本月，v1.2.29 - v1.2.30）

### 2.1 创建统一错误处理模块

**新建**：apps/server/src/error-handler.ts
**内容**：AppError 类（errorCode, httpStatus, isOperational）+ 错误码枚举 + 生产环境脱敏
**修改**：apps/server/src/index.ts 替换全局错误处理器 + 所有路由 catch 块改用 AppError

### 2.2 创建结构化日志模块

**新建**：apps/server/src/logger.ts + apps/server/src/request-logger.ts
**内容**：pino 配置（JSON 格式，日志级别可配置）+ requestId 生成和传递 + 请求日志中间件
**依赖**：npm install pino pino-pretty
**修改**：index.ts 挂载 request-logger + 所有 console.log/error 替换为 logger.info/error

### 2.3 修复 SSE 双重心跳

**问题**：index.ts 15s 心跳 + event-bus.ts 30s 心跳同时运行
**文件**：apps/server/src/event-bus.ts + apps/server/src/index.ts
**步骤**：
1. 删除 event-bus.ts 中的 heartbeatTimer、startHeartbeat()、stopHeartbeat()
2. 删除 addClient()/removeClient() 中的心跳启停逻辑
3. index.ts 中的心跳改为 30s（与 SSE.md 文档一致）

### 2.4 优化 broadcast() N+1 查询

**问题**：每次 broadcast 对每个客户端查一次 DB 获取 unreadCount
**文件**：apps/server/src/event-bus.ts
**步骤**：
1. 预编译 unreadCount 查询为模块级常量
2. 批量查询所有在线用户的 unreadCount（用 IN (...)）
3. 结果存 Map，广播时直接查 Map
4. 移除空 catch 块，改为 logger.warn
### 2.5 SSE 重连指数退避

**问题**：固定 3 秒重连，服务端宕机时产生大量无效请求
**文件**：apps/web/src/lib/sse.ts
**步骤**：
1. 添加 reconnectDelay 变量，初始 3000
2. 每次重连失败后 delay 翻倍，最大 60000
3. 连接成功后重置为 3000
4. 添加最大重试次数限制（如 50 次后停止）

### 2.6 dbRunWithRetry 改用 busy_timeout

**问题**：同步忙等待阻塞 Node.js 事件循环
**文件**：apps/server/src/db.ts
**步骤**：
1. 添加 db.pragma(busy_timeout = 5000)
2. 删除或简化 dbRunWithRetry 函数（移除 while 忙等待）

### 2.7 文件上传 magic bytes 校验

**问题**：仅校验 MIME type，可伪造 Content-Type
**文件**：apps/server/src/routes/upload.ts
**步骤**：
1. npm install file-type
2. 在 fileFilter 中添加 magic bytes 校验
3. 支持：JPEG (FF D8 FF), PNG (89 50 4E 47), GIF (47 49 46), WebP (52 49 46 46)

### 2.8 Token 黑名单机制

**问题**：登出后 token 4h 内仍有效
**新建**：apps/server/src/token-blacklist.ts
**修改**：apps/server/src/auth.ts + apps/server/src/routes/auth.ts
**步骤**：
1. 创建内存 Set 存储已注销的 token 签名 hash
2. authMiddleware 验证 token 时检查黑名单
3. POST /api/auth/logout 时将 token 加入黑名单
4. 密码修改时将当前 token 加入黑名单
5. 定期清理过期 token（每小时）

### 2.9 移除 event-bus.ts 中的 closeUserConnections()

**问题**：方法仍存在但已不使用，易误调用
**文件**：apps/server/src/event-bus.ts
**步骤**：删除 closeUserConnections() 方法
---

## 阶段三：P2 改进（1-2 个月，v1.3.0）

### 3.1 提取权限中间件

**问题**：30+ 处重复的权限检查代码
**新建**：apps/server/src/middleware/require-role.ts
**内容**：requireAdmin / requireManagerOrAbove / requireStoreManager / requireNotReadonly 中间件
**修改**：所有路由文件替换内联权限检查为中间件调用

### 3.2 添加 LRU 缓存层

**新建**：apps/server/src/cache.ts
**内容**：用户信息缓存（TTL 60s）+ 门店设置缓存 + 通知设置缓存 + 报表数据缓存
**依赖**：npm install lru-cache

### 3.3 添加基础测试覆盖

**新建目录**：apps/server/__tests__/
**测试文件**：auth.test.ts / entries.test.ts / payroll.test.ts / dividends.test.ts / sse.test.ts
**依赖**：npm install -D vitest
**配置**：package.json 添加 test: vitest run

### 3.4 N+1 查询优化

**文件**：routes/payroll.ts + routes/dividends.ts
**方案**：用 JOIN 替代循环查询 items

### 3.5 合并 SSE 双重广播

**问题**：一次记账操作产生两次 SSE 广播
**方案**：triggerNotification 返回事件数据由调用方决定是否广播，或添加 debounce 100ms

### 3.6 逐步开启 TypeScript strict

**文件**：apps/server/tsconfig.json
**步骤**：
1. 第一周：开启 noImplicitAny，修复所有报错
2. 第二周：开启 strictNullChecks，修复所有报错
3. 第三周：开启 strict: true，修复剩余报错

### 3.7 添加 ESLint + Prettier

**新建**：.eslintrc.cjs + .prettierrc
**依赖**：npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier

### 3.8 Graceful Shutdown

**文件**：apps/server/src/index.ts
**内容**：SIGTERM/SIGINT 处理中关闭 SSE 连接 + 关闭 DB + flush 日志 + 等待请求完成（超时 10s）

### 3.9 解决 React 19 removeChild 错误

**问题**：SSE 实时更新失效的根因
**文件**：apps/web/src/ 相关组件
**步骤**：
1. 用 React DevTools 定位触发 removeChild 的组件
2. 检查 Suspense + lazy + router 组合
3. 在 ErrorBoundary 中添加错误计数 + 自动恢复
4. 如无法修复，考虑降级 React 18
---

## 执行顺序建议

| 周次 | 任务 | 版本 |
|------|------|------|
| 第1周 | 1.1 输入净化 + 1.2 SSRF + 1.3 认证修复 + 1.4 乱码 + 1.5 require | v1.2.28 |
| 第2周 | 2.1 错误处理 + 2.2 日志 + 2.3 SSE心跳 + 2.4 broadcast优化 | v1.2.29 |
| 第3周 | 2.5 重连退避 + 2.6 busy_timeout + 2.7 magic bytes + 2.8 token黑名单 + 2.9 清理 | v1.2.30 |
| 第4-6周 | 3.1-3.5 代码质量改进 | v1.3.0-beta |
| 第7-8周 | 3.6-3.9 工程化改进 | v1.3.0 |

---

## 风险提示

1. **输入净化可能影响现有数据** - 需要对已有数据做迁移或兼容处理
2. **SSE 修改可能影响实时性** - 需要在测试环境充分验证
3. **TypeScript strict 开启会产生大量编译错误** - 需要分批处理
4. **缓存层引入可能带来数据一致性问题** - 需要设计合理的失效策略
5. **React 19 removeChild 是上游 bug** - 可能需要等待官方修复

---

## 代码异味与技术债务

| 类型 | 数量 | 示例 |
|------|------|------|
| as any 断言 | 290+ | 几乎每个 DB 查询结果都 as any |
| 重复 try-catch | 40+ | 每个路由 handler 都有相同 catch 块 |
| 重复权限检查 | 30+ | if (!isManagerOrAbove) return 403 |
| 混合 import/require | 1+ | index.ts 中 require(event-bus) |
| 乱码注释 | 多处 | index.ts 中 UTF-8 编码的中文注释被损坏 |
| 硬编码魔法值 | 多处 | 超时时间、限制数量等散落各处 |

---

*计划生成时间：2026-06-27*
*基于 AUDIT_REPORT.md 审计结果*
