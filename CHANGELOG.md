## v2.2.13 (2026-08-16)

### 自动备份修复 + Cron 表达式频率

#### 修复
- **保留份数不生效**：调度器硬编码保留 30 份，完全忽略设置页的"保留份数"。改为读取 `keepCount` 配置（1-100，默认 30），按文件修改时间新→旧排序，只超出部分删除
- **清理排序错误**：原按文件名排序，hourly/daily/weekly 三种前缀混排时顺序错乱（可能误删新备份）。改为按 mtime 排序
- **清理范围收窄**：只清理 `auto-backup-*.db`，手动备份 zip 和其他文件不受影响

#### 新增
- **备份频率改为 Cron 表达式**：设置页下拉框（每小时/每天/每周）换成 5 段式 cron 输入框（分 时 日 月 周），开启时默认 `0 3 * * *`（每日 03:00 备份一次，北京时间），附每日/每小时/每6小时/每周一快捷按钮
- **自研 cron 解析器**：无新增依赖，支持 `*`、`*/n`、`a`、`a-b`、`a-b/n`、逗号组合，周字段 0/7 均表示周日，标准 cron 的日/周同时受限时 OR 语义；显式 Asia/Shanghai 时区
- **错过触发补偿**：每 5 分钟检查一次，逐分钟回溯扫描（最多 24 小时），进程重启/停机期间错过的备份时间点会在恢复后补执行一次
- **保存设置不再重复触发**：PUT 接口保留 `lastBackupRun`/`lastBackupCheck` 时间戳
- **后端参数校验**：PUT /auto-backup 校验 cron 合法性与保留份数 1-100，非法返回 400 + 中文提示
- **旧配置兼容**：已有 `interval`（hourly/daily/weekly）配置自动映射为对应 cron，无需手动迁移

#### 影响文件
- [apps/server/src/scheduler.ts](file:///workspace/apps/server/src/scheduler.ts)：cron 解析器 + 调度逻辑重写 + keepCount 清理修复
- [apps/server/src/routes/system.ts](file:///workspace/apps/server/src/routes/system.ts)：GET/PUT /auto-backup 校验与默认值
- [apps/web/src/pages/settings/SettingsPage.tsx](file:///workspace/apps/web/src/pages/settings/SettingsPage.tsx)：频率输入框 UI

## v2.2.12 (2026-08-16)

### 经营日历桌面端横向布局优化

#### 优化
- **桌面端整月一屏显示**：日历组件在 lg 断点高度锁定为 `calc(100dvh-11rem)`（上限 860px），日期网格用 CSS 变量 `--cal-rows`（5 或 6 行）做等高行分布，日历底部不再超出屏幕；移动端仍保持 `aspect-[2/2.5]` 纵向比例
- **桌面端格子横向化**：桌面端取消格子 aspect 比例，改为日期数字居左 + 金额内容居右垂直居中的横向排列，充分利用宽屏空间
- **头部/星期栏防压缩**：月份切换头部与星期标题栏加 `shrink-0`，网格区 `flex-1 min-h-0` 承接全部剩余高度

#### 影响文件
- [apps/web/src/components/Calendar.tsx](file:///workspace/apps/web/src/components/Calendar.tsx)：桌面端高度锁定 + 等高行分布 + 横向格子布局（管理端/门店端经营日历共用该组件，同时生效）

## v2.2.11 (2026-07-13)

### 代码审查修复：补偿迁移 + 幂等性 + 历史数据迁移

#### 修复
- **强制补偿迁移 notifications.read_at**：在 `db.ts` 强制补偿迁移块新增独立 try-catch，确保 `read_at` 列一定存在，避免版本化迁移标记成功但实际未执行时列表接口 500
- **历史已读数据迁移**：升级前已读但无 `read_at` 的通知（`read=1, read_at=NULL`）会永久显示且永不清理。新增迁移 `UPDATE notifications SET read_at = created_at WHERE read=1 AND read_at IS NULL`，把它们按 `created_at` 起算 24 小时，超期的自动清理
- **标记已读幂等性**：`PUT /notifications/:id/read` 加 `AND read = 0` 条件，避免重复点击重置 `read_at` 倒计时（与"全部已读"接口保持一致）

#### 影响文件
- [apps/server/src/db.ts](file:///workspace/apps/server/src/db.ts)：read_at 强制补偿迁移 + 历史已读数据补填
- [apps/server/src/routes/notifications.ts](file:///workspace/apps/server/src/routes/notifications.ts)：单条标记已读加 AND read = 0

## v2.2.10 (2026-07-13)

### 周报/月报推送周期修正 + 已读通知24小时自动消失

#### 修复
- **周报推送上周数据**：`buildWeeklyReport` / `buildWeeklyReportHtml` / `buildWeeklyReportForStore` 原本计算"本周"日期范围（周一 09:00 触发时只有当天 0-9 点的极少量数据），改为计算"上周一至上周日"（-7 天），与"每周经营报告"语义一致
- **月报推送上月数据**：`buildMonthlyReport` / `buildMonthlyReportHtml` / `buildMonthlyReportForStore` 原本计算"本月"日期范围（每月 1 日 09:00 触发时只有 0-9 点的极少量数据），改为计算"上个月整月"，与"月度经营报告"语义一致
- **已读通知 24 小时后自动消失**：
  - `notifications` 表新增 `read_at` 字段（记录读取时间戳），含版本化补偿迁移
  - `PUT /notifications/:id/read` 与 `PUT /notifications/read-all` 标记已读时同步写入 `read_at`
  - `GET /notifications` 列表查询过滤掉 `read=1 且 read_at 早于 24 小时前` 的通知，不再显示
  - 清理任务由"删除已读超 30 天（按 created_at）"改为"删除已读超 24 小时（按 read_at）"

#### 影响文件
- [apps/server/src/notify.ts](file:///workspace/apps/server/src/notify.ts)：6 个周报/月报函数日期范围改为上周/上月
- [apps/server/src/db.ts](file:///workspace/apps/server/src/db.ts)：notifications 表新增 read_at 列 + 补偿迁移
- [apps/server/src/routes/notifications.ts](file:///workspace/apps/server/src/routes/notifications.ts)：标记已读写 read_at + 列表过滤 + 清理任务改 24 小时

## v2.2.9 (2026-07-07)

### 门店端日历单日详情页优化

#### 修复
- **门店收支金额居中对齐**：在金额 div 上添加 `whitespace-nowrap`，确保金额不换行、完整显示
- **过去日期隐藏添加按钮**：新增 `isPast` 逻辑判断（比较 URL 中的 `date` 与今天），过去日期 `canAdd = false`，悬浮添加按钮自动隐藏
- **左右滑动切换日期**：参考日历月份切换的实现，在详情页最外层 div 添加 `onTouchStart/onTouchEnd`，左滑下一日、右滑上一日，滑动阈值同月历（水平 > 50px 且垂直 < 40px）
- **日常交接不再走外部推送**：删除 `handovers.ts` POST /daily 路由中的 `triggerNotification({ type: 'shift' ... })` 调用，仅保留 `eventBus.broadcast` 站内 SSE 广播，修复日常交接被错误标记为"开闭店通知"并推送到外部的问题
- **清理未使用 import**：删除 `handovers.ts` 顶部已不再使用的 `triggerNotification` import

#### 影响文件
- [apps/web/src/pages/store/StoreCalendarDetailPage.tsx](file:///workspace/apps/web/src/pages/store/StoreCalendarDetailPage.tsx)：收支对齐 + 过去日期隐藏按钮 + 滑动切换日期
- [apps/server/src/routes/handovers.ts](file:///workspace/apps/server/src/routes/handovers.ts)：移除日常交接外部推送 + 清理 import

## v2.2.7 (2026-07-06)

### 日历格子文字自适应 + 数字显示优化

#### 修复
- **比例调整**：`aspect-[2/3]` 改为 `aspect-[2.5/2]`（即 5:4，纵向略瘦高），更合理利用空间
- **真正的自适应字号**：弃用 cqw clamp 方案（之前字号太小但有空位），改用 `useFitText` hook + canvas 文字宽度测量 + 二分查找最大可容纳字号，让文字撑满格子可用宽度
  - 新增 [useFitText.ts](file:///workspace/apps/web/src/hooks/useFitText.ts)：用 ResizeObserver 监听容器宽度变化，动态计算字号
  - 新增 [FitText.tsx](file:///workspace/apps/web/src/components/FitText.tsx)：复用组件
- **去掉万单位**：日历格子、管理端详情、门店端详情的 formatMoney 都改为显示完整数字，不再用"万"做单位

#### 影响文件
- `apps/web/src/components/Calendar.tsx`：比例 2.5:2，移除 container-type
- `apps/web/src/hooks/useFitText.ts`：新增自适应文字 hook
- `apps/web/src/components/FitText.tsx`：新增 FitText 组件
- `apps/web/src/pages/dashboard/CalendarPage.tsx`：用 FitText，去掉万单位
- `apps/web/src/pages/store/StoreCalendarPage.tsx`：用 FitText，去掉万单位
- `apps/web/src/pages/dashboard/CalendarDetailPage.tsx`：去掉万单位
- `apps/web/src/pages/store/StoreCalendarDetailPage.tsx`：去掉万单位

## v2.2.6 (2026-07-06)

### 日历交互优化

#### 修复
- **格子比例修正**：`aspect-[3/2]`（横向扁平，宽:高=3:2）改为 `aspect-[2/3]`（纵向瘦高，高是宽的 1.5 倍），更适合移动端纵向排列显示两行内容
- **左右滑动切换月份**：在日历容器添加触摸事件，向左滑下一月，向右滑上一月
  - 滑动阈值：水平位移 > 50px 且垂直位移 < 40px 才触发（避免纵向滚动误触）
  - 滑动后阻止 click 事件，避免误触日期格子
  - 头部添加"← 左右滑动切换"提示文字（仅桌面端显示）

#### 影响文件
- `apps/web/src/components/Calendar.tsx`：比例改为 2:3，添加 touch 滑动切换月份逻辑

## v2.2.5 (2026-07-06)

### 移动端日历格子布局优化（修正 v2.2.4）

#### 修复
- **格子比例**：`aspect-square`（正方形）改为 `aspect-[3/2]`（3:2 长方形），更适合移动端纵向排列
- **当天背景**：改回原来的浅色渐变 `from-indigo-100/90 via-purple-100/80 to-pink-100/80`（撤销 v2.2.4 的深色渐变）
- **当天日期数字**：用深色小圆 badge（`bg-indigo-500` 圆形）承载白色加粗放大 20% 的数字（12px → 14px），在浅色背景上清晰可读
- **内容字号自适应**：内容容器设 `container-type: inline-size`，文字字号用 `clamp(min, Ncqw, max)` 随格子宽度连续缩放，保证全部内容完整显示（不截断）
- **去掉 ± 符号**：盈利/亏损仅用红绿色区分，不再显示 +/- 前缀

#### 影响文件
- `apps/web/src/components/Calendar.tsx`：格子比例 3:2，背景恢复浅色，当天数字 badge 样式，容器设 container-type
- `apps/web/src/pages/dashboard/CalendarPage.tsx`：字号 cqw 自适应，去掉 +/- 符号
- `apps/web/src/pages/store/StoreCalendarPage.tsx`：字号 cqw 自适应，去掉 +/- 符号

## v2.2.4 (2026-07-06)

### 移动端日历格子布局优化

#### 问题
小屏机型上日期格子被挤压成长方形，金额和文字换行显示

#### 修复
- **保持正方形**：日期格子改用 `aspect-square` 替代固定 `min-h`，确保任何屏幕宽度下都是正方形
- **文字一行显示**：所有格子内文字添加 `whitespace-nowrap truncate`，通过缩小字号（利润 `text-[11px]`、副信息 `text-[9px]`）完全适配格子宽度
- **当天日期数字**：白色加粗 + 放大 20%（`text-xs` 12px → `text-sm` 14px）
- **当天格子背景**：改为深色渐变（`from-indigo-500 to-purple-600`），让白色日期数字清晰可读
- **当天内容文字**：管理端利润金额、门店端利润/休息标记、STAFF 圆点标记在当天格子内统一改为白色/半透明白色

#### 影响文件
- `apps/web/src/components/Calendar.tsx`：格子布局改为 `aspect-square flex flex-col`，当天数字样式
- `apps/web/src/pages/dashboard/CalendarPage.tsx`：利润文字适配 + 当天白色
- `apps/web/src/pages/store/StoreCalendarPage.tsx`：利润/休息标记适配 + 当天白色

## v2.2.3 (2026-07-06)

### 安全漏洞修复（S7-S12，全项目代码审查）

#### 高危漏洞修复
- **S7** `calendar.ts`：MANAGER 可跨店查看所有门店明细 → 非 ADMIN 强制按 `req.user.store_id` 过滤 `/monthly` 和 `/daily` 端点
- **S8** `system.ts`：STORE_ADMIN 可修改全局推送密钥 → `PUT /notification-settings` 权限从 `isStoreAdmin` 收紧为 `isAdmin`
- **S9** `system.ts`：GET `/notification-settings` 双重解密导致含 `:` 的 Token 被清空 → 删除多余的 `decryptToken` 调用（`getSettings()` 已内部解密）
- **S10** `seed.ts`：角色值使用小写与 ROLES 常量不一致 → 统一改为大写 `SHAREHOLDER`/`MANAGER`/`STAFF`
- **S11** `aliyun-ocr.ts`：凭证文件权限过宽 → 两处 `writeFileSync` 添加 `mode: 0o600`
- **S12** `startup-check.js`：自动创建 admin/admin123 弱密码 → 改为 `crypto.randomBytes` 生成随机密码 + `must_change_password=1`

### 死代码清理
- 后端：删除 `dbRunWithRetry`、`entryFilterClause`、`requireRole`、`report-scheduler.ts`、`autoStatus`、`error-handler` 5 个工厂函数及 `toJSON`/`getPublicMessage` 方法
- 前端 `Sidebar.tsx`：清理未使用 import（`useState`/`useEffect`/`api`/`LogOut`）
- 前端 `SettingsPage.tsx`：清理不可达的通知设置 UI（`openEditChannel` 从未被调用，导致整块死代码），包大小 34.45 kB → 31.56 kB
- 前端 `SettingsPage.tsx`：删除重复的 `RestartPoll` 函数

### 文档更新
- `ARCHITECTURE.md`：删除已废弃的 `report-scheduler.ts` 引用，补充 `calendar.ts` 和 `store-calendar.ts` 路由

## v2.2.2 (2026-07-06)

### 安全漏洞修复（S1-S6，全项目代码审查第一阶段）

#### 高危漏洞修复
- **S1** `auth.ts`：改密码后 `userCache` 未失效，旧 Token 60 秒内仍可用 → 改密后立即 `userCache.invalidate()` 并将当前 Token 加入黑名单
- **S2** `inventory.ts`：DELETE 先删子表再校验 `store_id` 导致数据丢失 → 先校验 `store_id` 归属再删除，DELETE 语句全部带 `AND store_id = ?`
- **S3** `inventory.ts`：多个端点缺 `store_id` 校验导致越权 → 所有涉及具体记录的 SELECT/UPDATE/DELETE 都加 `AND store_id = ?`
- **S4** `users.ts`：MANAGER 可跨店查看所有人工资 → 非 ADMIN 强制按自己 `store_id` 过滤
- **S5** `logs.ts`：SHAREHOLDER 角色穿透可看全部日志 → 补全角色分支，SHAREHOLDER 直接 403
- **S6** `dashboard.ts`：`/trend` 端点完全无角色校验 → 添加 `isManagerOrAbove` 检查和 `effectiveStoreId` 逻辑

## v1.7.3b (2026-06-29)

### JPush Integration
- Hardcoded JPush appKey and masterSecret as defaults in server code
- No manual configuration needed - works out of the box
- capacitor.config.json appKey matches server defaults

## v1.7.3 (2026-06-29)

### Native APP Fixes
- ImagePreview: resolveImageUrl() prepends server URL for relative image paths in native app
- main.tsx: re-apply StatusBar on app foreground (fixes JPush overlay after notification init)
- Dockerfile: fix double /app//app/ path in sed command
- Added @capacitor/app dependency for appStateChange listener

## v1.6.3 (2026-06-28)

状态栏适配 + Capacitor 原生推送

### 状态栏适配
- 添加 safe-area-inset-top padding，适配刘海屏和状态栏
- AppShell 使用 CSS env() 安全区域变量
- BottomNav 底部安全区域适配

### Capacitor 原生推送
- BrowserPushPrompt 检测原生环境，使用 Capacitor PushNotifications 插件
- PushSettingsModal 原生 APP 显示「APP 推送通知」而非「浏览器推送通知」
- 服务端新增 /push/capacitor-token 端点存储原生推送 Token
- 安装 @capacitor/push-notifications 依赖

## v1.6.1 (2026-06-28)

APP 原生 HTTP 绕过 CORS + 测试连接修复

### Capacitor 原生 HTTP
- 启用 CapacitorHttp 插件，原生 APP 所有请求走设备原生网络层
- 完全绕过浏览器 CORS 限制，直接访问远程服务器
- 服务器地址支持 HTTPS 加密传输，安全性不变

### ServerConfigPage 修复
- 原生 APP 使用 CapacitorHttp 测试连接（无 CORS 问题）
- 浏览器环境保留 no-cors fallback（检测服务器可达性）
- 超时 10 秒自动提示连接超时
- 保存后自动跳转登录页

### capacitor.config.json
- 添加 CapacitorHttp.enabled: true
- 添加 server.cleartext: true（支持本地开发 HTTP）

# Changelog

## v1.5.7 (2026-06-28)

容器入口改造 + 崩溃自动恢复

### 容器入口改造
- 新增 entrypoint.js 替代 startup.sh 作为容器入口
- 使用 Node.js 执行，彻底避免 BOM/CRLF 导致启动失败
- 自动检测依赖缺失并安装（tsx/express/better-sqlite3/sanitize-html）

### 崩溃自动恢复
- 应用崩溃 3 次（30秒内）自动进入 msl.js 恢复模式
- msl.js 不依赖 startup.sh，可独立运行
- 恢复模式下可备份数据库、重置密码、更新系统

### 启动流程
- entrypoint.js 先运行 startup-check.js 诊断
- 然后检查依赖完整性
- 最后启动应用，监控崩溃自动重启

## v1.5.6 (2026-06-28)

权限修复 + 前端组件修复 + Docker优化

### 权限安全修复
- shifts.ts: POST路由添加只读角色(SHAREHOLDER)权限检查
- inventory.ts: POST /items/reorder添加canOperateInventory权限检查
- categories.ts: POST/PUT/DELETE从仅检查SHAREHOLDER改为isManagerOrAbove
- middleware/require-role.ts: 修复isStoreAdminOrAbove导入名
- lib/roles.ts: entryFilterClause添加TypeScript类型注解

### 前端权限匹配
- permissions.ts: dashboard权限扩展为ADMIN/STORE_ADMIN/MANAGER
- permissions.ts: stores权限扩展为所有角色
- permissions.ts: notifications权限扩展为所有角色

### 前端组件修复
- PushSettingsModal.tsx: 添加useConfirm()钩子调用(修复ConfirmDialog未定义)
- StoreShiftsPage.tsx: 添加useConfirm导入(修复缺失导入)
- NotificationsPage.tsx: 防御性API响应解析
- StoreNotificationsPage.tsx: 防御性API响应解析
- StoreInventoryPage.tsx: 修复checks/items数据解析
- StoreShiftsPage.tsx: 修复photos数据解析

### Docker优化
- Dockerfile: 添加阿里云apt镜像加速
- Dockerfile: startup.sh BOM自动修复
- startup.sh: 添加sanitize-html依赖检查

## v1.5.0 (2026-06-28)

全面代码审查优化 — 4专家交叉审查（安全/性能/前端/架构），28项问题全部修复

### 安全加固
- .env 从 git 移除，环境变量强制要求 JWT_SECRET
- 112条路由 catch 块防止泄露内部错误信息
- 阿里云凭证 AES-256-GCM 加密存储
- 列表分页 pageSize 上限 100（7条路由）
- 登录响应字段白名单
- bcrypt.compareSync 全部改为异步

### 数据完整性
- 分红/进货删除加事务保护
- DB 迁移 schema_version 版本追踪
- entries 表增加 updated_at 字段

### 性能优化
- dashboard.ts N+1查询优化（16次→4次）
- notify.ts N+1查询优化（60次→18次）
- strftime改为日期范围查询
- StoreGuard 时间组件用 React.memo 缓存
- 前端缓存 LRU 淘汰

### 架构改进
- index.ts 拆分为 app/scheduler/shutdown/index
- API 响应格式统一
- AppError 错误码系统
- console→pino 结构化日志
- 通知重试机制（指数退避3次）
- setInterval 防重复执行
- 数据备份 VACUUM INTO

### 前端改进
- 15处原生 confirm→useConfirm hook
- SSE BroadcastChannel 多标签页
- SW 网络优先策略
- 键盘弹起收起底部导航
- 10处 aria-label
- 登录页 logo 文件引用
- CSP nonce 注入

### 通知优化
- SSE 精确缓存失效（账户/店铺/报表独立事件）
- 浏览器推送订阅状态检测
- 退出登录自动取消推送订阅
- 通知中心事件绑定

### 已知限制
- 通知模块拆分暂缓（448行，风险大于收益）
- Chrome subscribe() 在部分国内网络环境超时（FCM 不可达）

## v1.4.4 (2026-06-28)
- PWA 图标彻底清理

## v1.4.3 (2026-06-28)
- PWA 推送修复 + 图标修复

## v1.4.2 (2026-06-28)
- 权限修复 + UTC 时间问题修复

## v1.3.3 (2026-06-25)
- 推送设置改进 + 日志过滤优化

## v1.3.2 (2026-06-24)
- 修复推送通知和浏览器检测
- 修复爱语飞飞推送 + 浏览器检测覆盖手机浏览器

## v1.3.1 (2026-06-23)
- 修复启动自检和 msl 工具
- startup.sh 自动创建 msl 命令

## v1.3.0 (2026-06-22)
- CI 自动生成 cleanup.json + 完整升级流程文档
- Chrome 推送 FCM 连通性检测
- 推送订阅 fire-and-forget + 轮询检测
- 修复 React 19 removeChild 错误
- SSE 双重连接修复
- 单实例防重复执行
- compression 跳过 SSE 连接
- Modal Chrome 兼容性修复