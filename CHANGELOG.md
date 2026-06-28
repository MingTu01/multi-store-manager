# Changelog

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