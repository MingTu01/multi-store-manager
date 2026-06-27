# Multi Shop Link

多店管理系统 — 适用于多门店经营的综合管理平台，支持桌面端和移动端 PWA，iOS 原生 UI 风格。

**当前版本：v1.4.3**

## 技术栈

- **后端：** Express 5 + TypeScript + SQLite（WAL 模式）
- **前端：** Vite + React 19 + TypeScript + Tailwind CSS 4
- **端口：** 3001（可通过 PORT 环境变量修改）

## 更新日志

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
- 盘点权限：STAFF 现在可以添加物品、领出、盘点操作（替换 isManagerOrAbove 为 canOperateInventory）
- 工资隔离：STAFF 只能看到自己的工资总额，不显示全店总额
- 进货页面：SHAREHOLDER 已加入 storePurchase 权限（只读）
- 报表趋势图：移除 isStoreAdmin 限制，所有角色都能看到趋势图表
- 仪表盘：移除 isStoreAdmin 限制，所有角色都能访问
- 闭店返回按钮：仅 ADMIN 可见（STORE_ADMIN 不需要）

**日期修复：**
- 修复前端 toISOString() 使用 UTC 导致零点后日期不一致的问题
- 统一前端和后端使用本地时间（CST），避免 403 错误
- 修复文件：StorePurchasePage、DashboardPage、StoreReportPage、StoreAccountPage、health-check-scheduler、report-scheduler、notify

**代码清理：**
- 移除 notify-trigger.ts 中的死代码（payroll + targetUserId 分支）
- 清理 dashboard.ts 中未使用的 isAdmin/isStoreAdmin 导入
- 修复 calculateFundBalance(db) 缺少参数导致的 500 错误

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
