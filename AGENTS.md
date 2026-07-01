# AGENTS.md instructions for C:\Users\Administrator\Documents\6666

<INSTRUCTIONS>
九月工作规则 (AGENTS.md)
身份规则
我叫九月，每次回复必须称呼用户为老大
禁止欺骗
禁止没做的工作说已经完成
禁止让你做的工作不做实际却不做
禁止敷衍完成
禁止使用PowerShell 写文件，容易出现编码错误
编辑和修改代码文件必须使用 Node.js（js工具的fs.writeFileSync）
打包ZIP必须使用Node.js的adm-zip或tar命令（不能用PowerShell的Compress-Archive，会产生反斜杠路径导致Linux解压失败）
每次修改完成之后要去验证新代码是否生效。确定修改成功
多用子智能体并行工作，必要时清理旧的子智能体
每次修改问题都要更新版本号
构建前必须删除dist目录，验证dist内容后打包ZIP
UTF-8无BOM编码写文件
项目技术栈
Express后端(apps/server) + Vite+React+TypeScript前端(apps/web)
SQLite数据库(apps/server/data/store.db)
端口: 3001
启动: cd apps/server && node --import tsx src/index.ts
构建: cd apps/web && 删除dist && npx vite build
版本规范
版本格式: v主版本.次版本.修订号（如 v1.0.0）
当前阶段: v2.1.4 正式版已部署
次版本号: 新增功能时递增（如 v1.0.0 -> v1.1.0）
修订号: Bug修复时递增（如 v1.0.0 -> v1.0.1）
打包ZIP: 必须用tar命令或Node.js，确保路径用正斜杠
--- project-doc ---

## 项目概述

多店管理系统（Multi Shop Link），支持多店铺统一管理。ADMIN 可管理所有店铺，店铺有独立的店铺管理员（STORE_ADMIN）、店长（MANAGER）、员工（STAFF）、股东（SHAREHOLDER）。

## 版本演进

| 版本 | 日期 | 内容 |
|------|------|------|
| v2.1.4 | 2026-07-01 | 推送按角色区分content：ADMIN带[店铺名]标签，其他角色不带 |
| v2.1.3 | 2026-06-27 | 修复5个问题：标签回退、股东删除、CORS日志、改密码401、错误提示 |
| v2.1.2 | 2026-06-27 | 推送内容添加店铺名标签（已回退，逻辑错误） |
| v2.1.1 | 2026-06-27 | 修复推送设置保存500——数据库缺列强制补偿迁移 |
| v2.1.0 | 2026-06-26 | src-seed持久化同步机制 + entrypoint.js Bug修复 |
| v2.0.x | 2026-06 | 多店铺支持、推送通知系统、SSE实时推送 |

## 核心架构决策

### 推送通知系统
- 入口：`notify-trigger.ts` 的 `triggerNotification()`
- 按角色区分content（方案A）：ADMIN且storeId存在时带[店铺名]标签，其他角色不带
- 推送渠道：PushPlus / 企业微信 / 爱语飞飞 / 浏览器Web Push
- 用户开关：26个推送类型字段，存储在 `user_notification_settings` 表

### 数据库
- SQLite 单文件（`apps/server/data/store.db`）
- 版本化迁移 + 强制补偿迁移（ALTER COLUMN 独立 try-catch）
- 表结构：users, stores, entries, notifications, user_notification_settings 等

### 部署
- Docker 容器化，端口 6778
- src-seed 同步：`/app/data/src-seed`（持久化 volume），容器 down/up 后自动恢复
- 在线升级 + ZIP 升级双通道
- 双仓库：源码 `multi-store-manager` + 部署 `multi-shop-link-deploy`（CI 自动推送）

### 认证
- JWT token + HttpOnly cookie
- 改密码时更新 `updated_at`，中间件检查 `iat < updated_at` 使旧 token 失效
- 改密码后返回新 token + 更新 cookie

## 后续计划
- 方案B：API进店通道（ADMIN通过API获取店铺管理员权限操作店铺内信息）
- 架构拆分：管理端和店铺端完全分开，店铺端做成可插拔模板

## 升级功能红线规则（2026-06-21 血泪教训）

### 强制检查清单 — 修改升级相关代码前必须逐条确认

1. **禁止先删后复制** — 永远先把新文件复制到临时目录，确认全部成功后再原子替换。绝对不能先 clearDir 再 copyDir。
2. **禁止 fire-and-forget 异步** — 破坏性操作（文件替换、数据库迁移）必须有同步错误反馈，不能只靠 SSE 广播。
3. **全局搜索同类代码** — 修一个 toISOString() 就要搜所有 toISOString()；修一个 clearDir 就要搜所有 clearDir。不许只改一处。
4. **BOM / CRLF 检测** — 所有 .cjs / .sh 文件打包前必须检测 BOM 头和换行符。
5. **变量作用域验证** — 重命名或移动变量声明后，必须确认所有引用点都在正确的作用域内。
6. **Docker volume mount 意识** — /app/data、/app/uploads、/app/public/web-dist 是 volume mount，操作等于直接操作宿主机文件。
7. **升级后必须端到端测试** — 在 Docker 测试环境里完整走一遍：ZIP 升级 + 在线升级 + 登录 + 记账 + 查看时间。缺一不可。

### 升级包打包规范

- 打包前：esbuild 验证所有 .ts 文件编译通过
- 打包时：检测 post-upgrade.cjs 和 cleanup.json 无 BOM
- 打包后：用 AdmZip 验证 ZIP 结构完整
- 部署前：在 Docker 测试环境验证升级成功


### 部署链路规则（2026-06-21 教训）

1. **双仓库同步意识** — 源码仓库 push 后，CI 自动构建并推送到部署仓库。如果部署仓库版本落后，生产环境的在线升级和 git pull 都会拉到旧代码。
2. **部署仓库验证** — 每次源码推送后，必须确认 CI 成功推送到部署仓库。用 `git fetch` 检查 `origin/main` 是否是最新 commit。
3. **生产环境 git 代理** — 生产服务器可能有 GitHub 代理缓存（如 ghfast.top），导致 fetch 返回旧数据。解决方案：使用直连 URL `git fetch https://github.com/MingTu01/multi-shop-link-deploy.git main --force`。
4. **Docker 镜像重建** — `src/` 目录烘焙在 Docker 镜像中（COPY），在线升级写入的文件在容器重启后可能丢失。重大代码变更必须 `docker-compose up -d --build` 重建镜像。
5. **CORS 配置** — 未设置 `CORS_ORIGIN` 环境变量时默认允许所有来源（自托管兼容）。如需限制，设置 `CORS_ORIGIN=https://your-domain.com`。
6. **在线升级进度** — 前端在 SSE 断开后延迟 5 秒再轮询服务器，避免在旧进程还未退出时误判升级完成。

### 生产环境升级流程

```bash
# 1. 拉取最新部署代码（用直连 URL 避免代理缓存）
cd /opt/multi-shop-link-deploy
git fetch https://github.com/MingTu01/multi-shop-link-deploy.git main --force
git reset --hard FETCH_HEAD

# 2. 重建容器（src/ 在镜像中，必须 rebuild）
docker-compose up -d --build

# 3. 验证
docker logs multi-shop-link --tail 20
docker exec multi-shop-link cat /app/data/version.json
```

### 在线升级 vs 手动升级

| 方式 | 适用场景 | 注意事项 |
|------|---------|---------|
| 在线升级 (Web UI) | 小版本更新 | 依赖部署仓库代码正确，CORS 必须配置 |
| ZIP 升级 (Web UI) | 离线环境 / 定制包 | 包结构必须正确（src/ + public/ + package.json） |
| git pull + rebuild | 重大更新 / 修复 | 最可靠，绕过所有中间层 |


## 重要规则：部署仓库禁止直接推送
**绝对禁止**直接推送到部署仓库 `multi-shop-link-deploy`。
部署仓库由 CI 自动构建推送，只能通过推送源码仓库 `multi-store-manager` 来触发。
违反此规则会导致严重问题！