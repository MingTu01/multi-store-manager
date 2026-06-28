# Multi Shop Link

多店管理系统 — 适用于多门店经营的综合管理平台，支持桌面端和移动端 PWA，iOS 原生 UI 风格。

**当前版本：v1.6.0**

## 技术栈

- **后端：** Express 5 + TypeScript + SQLite（WAL 模式）
- **前端：** Vite + React 19 + TypeScript + Tailwind CSS 4
- **端口：** 3001（可通过 PORT 环境变量修改）

## 更新日志

### v1.5.9 (2026-06-28)

安全审计修复:
- 后端: dividends STAFF拦截、payroll权限去重、purchase sanitizeText、shifts handover净化、inventory权限提升
- 前端: StorePayrollPage canManage守卫、StoreShiftsPage 开闭店权限守卫、StoreDividendsPage 创建按钮守卫
- 其他: StoreGuard返回按钮、StoreOverviewPage店名清理、data.ts登录页优化

### v1.5.0 (2026-06-28)

**全面代码审查优化 — 4专家交叉审查（安全/性能/前端/架构）**

安全加固:
- .env 从 git 移除，环境变量强制要求 JWT_SECRET
- 112条路由 catch 块防止泄露内部错误信息
- 阿里云凭证 AES-256-GCM 加密存储
- 列表分页 pageSize 上限 100（7条路由）
- 登录响应字段白名单防泄露 salary/address
- bcrypt.compareSync 全部改为异步 bcrypt.compare

数据完整性:
- 分红/进货删除加事务保护
- 销毁删除加事务保护
- DB 迁移加 schema_version 版本追踪
- 外键约束加 TODO 注释标记
- entries 表增加 updated_at 字段

性能优化:
- dashboard.ts N+1 查询优化（16次→4次批查询）
- notify.ts N+1 查询优化（60次→18次批查询）
- strftime 全部改为范围查询（利用索引）
- StoreGuard 时间组件用 React.memo 避免重渲染
- 前端缓存 LRU 淘汰优化

架构改进:
- index.ts 377行拆分为 4 文件（app/scheduler/shutdown/index）
- API 响应格式统一为 { success, data, pagination }
- AppError 错误码系统（auth.ts 13处 + stores.ts 27处）
- 20个文件 console 替换为 pino 结构化日志
- 通知重试机制（指数退避3次）
- setInterval 防重复执行（数据库标记）
- 数据备份 VACUUM INTO
- settingsCache 主动失效

前端改进:
- 15处原生 confirm 替换为自定义 useConfirm hook
- SSE BroadcastChannel 多标签页支持
- Service Worker 网络优先策略（PWA更新支持）
- 键盘弹起自动收起底部导航
- 10处 aria-label 无障碍标注
- 登录页 Base64 logo 改为文件引用
- CSP nonce 注入 SPA script 标签

### v1.4.4 (2026-06-28)

**PWA 图标彻底修复：**
- 删除旧的 icon-192.png、icon-512.png
- 统一所有图标引用为 logo.png / logo-192.png / logo-64.png
- 修复根目录 manifest.json 和 src-sw/sw.ts 的旧图标引用
- 清理 public/web-dist/ 残留旧文件

### v1.4.3 (2026-06-28)

**PWA 推送修复：**
- 修复移动端推送订阅失败：不再每次加载销毁 SW 注册，保留 push subscription
- 优化订阅逻辑：先用 Promise.race 带超时尝试，失败再轮询
- 修复 BrowserPushPrompt 同样的订阅问题

**PWA 图标修复：**
- manifest.json 图标统一使用 logo.png
- msl-sw.js 推送通知图标改为 logo.png
- index.html favicon 改为 logo.png

### v1.4.2 (2026-06-28)

**权限修复：**
- 盘点权限：STAFF 现在可以添加物品、领出、盘点操作
- 工资隔离：STAFF 只能看到自己的工资总额，不显示全店总额
- 进货页面：SHAREHOLDER 已加入 storePurchase 权限（只读）
- 报表趋势图：移除 isStoreAdmin 限制，所有角色都能看到趋势图表
- 仪表盘：移除 isStoreAdmin 限制，所有角色都能访问

**日期修复：**
- 修复前端 toISOString() 使用 UTC 导致零点后日期不一致的问题
- 统一前端和后端使用本地时间（CST），避免 403 错误

### v1.3.3 (2026-06-25)

- 推送设置改进 + 日志过滤优化
- 修复 isFCMBrowser 未定义错误
- 推送通知点击跳转对应页面

### v1.2.27 (2026-06-22)

- 安全加固：httpOnly Cookie 认证
- Token 过期缩短：24h → 4h
- CORS 收紧
- ZIP SHA256 校验
- SQL 参数化
- 文件删除权限校验

## 部署

详见 [DEPLOY.md](./DEPLOY.md)