# Multi Shop Link - 升级流程完整文档

## 一、版本号规则

### 1.1 版本格式

`v主版本.次版本.修订号`

- 主版本（Major）：重大架构变更或不兼容更新，由管理员手动指定
- 次版本（Minor）：新功能、功能增强，每次更新必须递增
- 修订号（Patch）：Bug 修复、小改动，每次更新必须递增

### 1.2 版本号递增规则

| 场景 | 版本变化 | 示例 |
|------|----------|------|
| 新功能 | Minor +1，Patch 归零 | v1.0.2 → v1.1.0 |
| Bug 修复 | Patch +1 | v1.0.2 → v1.0.3 |
| 重大更新 | Major +1，Minor/Patch 归零 | v1.0.2 → v2.0.0 |

### 1.3 版本号存储位置

每次更新必须同步修改以下文件：
1. `apps/server/package.json` — 服务端版本
2. `apps/server/data/version.json` — 系统显示版本
3. `apps/web/package.json` — 前端版本

---

## 二、CI 自动构建流程

源码仓库推送到 main 分支后，GitHub Actions 自动执行：

```
源码仓库 push main
    ↓
CI 构建前端（npx vite build）
    ↓
克隆部署仓库（multi-shop-link-deploy）→ deploy/
    ↓
记录旧文件列表 → /tmp/old-files.txt
    ↓
保留部署仓库专有文件（entrypoint.sh, docker-compose.yml 等）
    ↓
删除部署仓库中的旧 src/ 和 public/
    ↓
复制新的 src/、public/web-dist/、msl.js、startup-check.js、startup.sh
    ↓
复制 scripts/deploy/Dockerfile → 部署仓库 Dockerfile
    ↓
运行 generate-cleanup.js → 生成 cleanup.json
    ↓
恢复保留的部署仓库专有文件
    ↓
更新 version.json
    ↓
提交并推送到部署仓库
```

### 2.1 关键架构说明

**源码仓库（multi-store-manager）结构：**
```
multi-store-manager/
├── .github/workflows/build-deploy.yml   ← CI 配置
├── scripts/
│   ├── deploy/
│   │   └── Dockerfile                   ← 部署专用 Dockerfile（扁平路径）
│   └── generate-cleanup.js              ← cleanup.json 生成脚本
├── apps/
│   ├── server/                          ← 后端源码
│   │   ├── src/
│   │   ├── msl.js                       ← 容器管理终端工具
│   │   ├── startup-check.js             ← 开机自检
│   │   ├── startup.sh                   ← 启动脚本
│   │   └── package.json
│   └── web/                             ← 前端源码
│       └── src/
└── Dockerfile                           ← 本地开发用（源码结构路径）
```

**部署仓库（multi-shop-link-deploy）结构：**
```
multi-shop-link-deploy/
├── Dockerfile                           ← 部署专用（扁平路径）
├── entrypoint.sh                        ← 部署仓库专有（CI 保留）
├── docker-compose.yml                   ← 部署仓库专有（CI 保留）
├── .npmrc
├── package.json
├── package-lock.json
├── tsconfig.json
├── cleanup.json                         ← CI 自动生成的清理清单
├── post-upgrade.cjs                     ← 升级后置脚本
├── msl.js                               ← 容器管理终端工具
├── startup-check.js                     ← 开机自检
├── startup.sh                           ← 启动脚本
├── data/
│   └── version.json
├── src/                                 ← 服务端源码（扁平结构）
├── public/
│   ├── web-dist/                        ← 前端构建产物
│   └── reports/
└── backups/
```

### 2.2 Dockerfile 路径说明

**源码仓库 Dockerfile（本地开发用）：**
- 路径：`Dockerfile`（根目录）
- 路径格式：`COPY apps/server/src ./src/`（monorepo 结构）
- 用途：本地 `docker-compose up -d --build`

**部署专用 Dockerfile（CI 使用）：**
- 路径：`scripts/deploy/Dockerfile`
- 路径格式：`COPY src ./src/`（扁平结构）
- 用途：CI 自动复制到部署仓库
- **注意：不要放在 `deploy/` 目录，会被部署仓库 checkout 覆盖！**

### 2.3 CI 保留文件列表

以下文件是部署仓库专有，CI 会在更新前保留、更新后恢复：

| 文件 | 说明 |
|------|------|
| `entrypoint.sh` | Docker 入口脚本 |
| `docker-compose.yml` | Docker Compose 配置 |
| `.dockerignore` | Docker 构建排除 |
| `.gitignore` | Git 排除规则 |
| `post-upgrade.cjs` | 升级后置脚本 |

### 2.4 cleanup.json 自动生成

`scripts/generate-cleanup.js` 在 CI 中自动运行，对比旧文件列表与新构建产物：

- 旧版本中有、新版本中没有的 `.js` / `.css` / `.html` / `.ts` 文件 → 写入 `cleanup.json`
- 升级代码读取 `cleanup.json` 后会删除这些废旧文件
- 如果生成失败，输出空的 `cleanup.json`，不影响升级流程

---

## 三、在线升级流程

通过管理后台 → 系统设置 → 系统升级 → "检查更新" 触发。

### 3.1 完整步骤

```
 1. 备份数据库 → backups/pre-upgrade-{时间}.zip
 2. 从 GitHub 下载部署仓库 main.zip（通过加速代理）
 3. SHA256 完整性校验
 4. 解压到临时目录 → uploads/extract-{时间戳}/
 5. 读取 cleanup.json → 删除废旧文件
 6. 复制 public/ → 覆盖 /app/public/
 7. 复制 src/ → 覆盖 /app/src/
 8. 更新 package.json、version.json
 9. 运行 post-upgrade.cjs（如果存在）
10. 删除临时解压目录
11. 重启服务（process.exit → Docker 自动重启）
```

### 3.2 cleanup.json 机制

升级包中的 `cleanup.json` 是清理废旧文件的唯一安全机制：

```json
{
  "version": "2026-06-27",
  "description": "Auto-cleanup: 5 files removed",
  "deleteFiles": [
    "public/web-dist/index-OLDHASH.js",
    "public/web-dist/assets/App-OLDHASH.js",
    "src/seed-test-data.ts"
  ],
  "deleteDirs": []
}
```

- `deleteFiles`：要删除的文件列表，路径相对于 `/app/`
- `deleteDirs`：要删除的目录列表
- 升级代码会校验路径安全性，拒绝包含 `..` 的路径
- 不会清空目录再复制（防止中途失败导致崩溃）

### 3.3 安全机制

| 机制 | 说明 |
|------|------|
| 数据库备份 | 升级前自动备份到 backups/ |
| SHA256 校验 | 验证下载包完整性 |
| 路径白名单 | cleanup.json 中的路径拒绝 `..` 等不安全字符 |
| 临时目录隔离 | 解压到 `uploads/extract-*`，完成后清理 |
| 自动重启 | 升级完成后 `process.exit(0)`，Docker 自动重启 |

---

## 四、ZIP 上传升级流程

通过管理后台 → 系统设置 → 系统升级 → 选择 ZIP 文件上传。

流程与在线升级基本相同，区别：
- 使用上传的 ZIP 文件而非从 GitHub 下载
- 额外执行 `npm install --omit=dev`
- 支持 `post-upgrade.cjs` 后置脚本

---

## 五、版本兼容性

### 5.1 兼容性规则

- 最大跳跃版本数：5 个次版本（MAX_MINOR_JUMP = 5）
- 兼容：totalMinor <= 5，可直接升级
- 不兼容：totalMinor > 5，建议分步升级

### 5.2 totalMinor 计算公式

```
totalMinor = (目标主版本 - 当前主版本) x 100 + (目标次版本 - 当前次版本)
```

示例：
- v1.1.68 → v1.3.0：totalMinor = 2，兼容
- v0.5.0 → v1.3.0：totalMinor = 103，不兼容

---

## 六、回滚机制

### 6.1 自动备份

每次升级前自动创建 `backups/pre-upgrade-{时间}.zip`，包含：
- `store.db`（主数据库）
- `store.db-wal`（WAL 日志）
- `store.db-shm`（WAL 共享内存）

### 6.2 手动回滚

```bash
# 1. 进入容器
docker exec -it multi-shop-link bash

# 2. 恢复数据库
cd /app/data
unzip /app/backups/pre-upgrade-{时间}.zip

# 3. 重启
exit
docker restart multi-shop-link
```

---

## 七、容器管理工具（msl）

容器内置 `msl` 终端管理工具，可通过以下命令进入：

```bash
docker exec -it multi-shop-link msl
```

### 7.1 功能菜单

| 选项 | 功能 |
|------|------|
| 1 | 系统信息（版本、运行时间、数据统计） |
| 2 | 备份数据库 |
| 3 | 恢复数据库 |
| 4 | 重置管理员密码 |
| 5 | 查看最近日志 |
| 6 | 清理临时文件 |
| 7 | 数据库维护 |
| 8 | 更新系统 |
| 9 | 版本回退 |
| A | 诊断修复 |
| 0 | 退出 |

### 7.2 开机自检

容器启动时自动运行 `startup-check.js`，检查：
- `package.json` 格式和 BOM
- `version.json` 存在性
- 数据目录完整性
- 数据库可访问性
- 数据库表结构
- 管理员账户
- JWT Secret
- 前端文件
- Service Worker
- WAL 文件大小
- `node_modules` 存在性
- 环境变量

自检结果会在容器日志中显示：`docker logs multi-shop-link`

---

## 八、生产环境完整重建

当需要完整重建生产环境时（如依赖变更、Dockerfile 修改）：

```bash
# 1. 进入部署仓库目录
cd /opt/multi-shop-link-deploy

# 2. 拉取最新代码
git pull

# 3. 重建并启动
docker-compose up -d --build

# 4. 验证
docker logs multi-shop-link
docker exec -it multi-shop-link msl
```

---

## 九、开发热更新（调试用）

开发调试时，直接把修改后的文件复制到运行中的容器。

### 前端热更新

```powershell
# 1. 构建前端
cd apps/web
npx vite build

# 2. 复制到容器
docker cp apps/web/dist/. multi-shop-link:/app/public/web-dist/

# 3. 浏览器强制刷新 (Ctrl+Shift+R)
```

前端改动不需要重启容器。

### 后端热更新

```powershell
# 1. 复制修改后的文件
docker cp apps/server/src/routes/system.ts multi-shop-link:/app/src/routes/system.ts

# 2. 重启容器
docker restart multi-shop-link
```

### 注意事项

- 热更新不会清理旧的 hash 文件（前端），但不影响功能
- 热更新不会执行 `npm install`，如果依赖变化需要重新构建镜像
- 热更新后需要手动同步到部署仓库

---

## 十、故障排查

### 10.1 升级失败：下载超时

原因：GitHub 访问受限

解决：系统已配置加速代理，如果仍然失败可以手动下载 ZIP 包通过上传方式升级。

### 10.2 升级失败：SHA256 不匹配

原因：下载包被篡改或传输错误

解决：重试升级

### 10.3 升级后页面空白

原因：浏览器缓存了旧的 Service Worker

解决：
1. Ctrl + Shift + R 强制刷新
2. F12 → Application → Service Workers → Unregister
3. 清除浏览器缓存后重新访问

### 10.4 升级后数据库错误

解决：
1. 恢复备份：`unzip /app/backups/pre-upgrade-*.zip -d /app/data/`
2. 重启容器：`docker restart multi-shop-link`

### 10.5 残留临时目录

解决：管理后台 → 系统设置 → 升级清理功能

### 10.6 容器启动崩溃：MODULE_NOT_FOUND

原因：`package.json` 缺少依赖声明

解决：
```bash
# 进入容器安装缺失依赖
docker exec -it multi-shop-link npm install <missing-package> --omit=dev

# 或完整重建
docker-compose up -d --build
```

### 10.7 msl 命令不存在

原因：Dockerfile 未正确复制 `msl.js`

解决：
```bash
# 检查文件是否存在
docker exec multi-shop-link ls -la /app/msl.js

# 如果不存在，需要重新构建
cd /opt/multi-shop-link-deploy && git pull && docker-compose up -d --build
```

---

## 十一、依赖管理规范

### 11.1 核心原则

**所有 `import` 引用的第三方包必须在 `package.json` 的 `dependencies` 中声明。**

本地环境手动安装的包（如 `npm install pino`）如果未提交到 `package.json`，CI 构建时不会安装，导致生产环境崩溃。

### 11.2 检查方法

```bash
# 列出所有外部 import
grep -rh "from '" apps/server/src/ | grep -v "from '\." | grep -v "from 'node:" | sort -u

# 对比 package.json dependencies
node -p "Object.keys(require('./apps/server/package.json').dependencies).join('\n')"
```

### 11.3 常见陷阱

| 场景 | 问题 | 解决 |
|------|------|------|
| 本地 `npm install` 但未 `--save` | `package.json` 不更新 | 使用 `npm install --save` |
| CI 构建成功但生产崩溃 | 本地有 `node_modules` 但 `package.json` 缺声明 | 检查并补充依赖 |
| TypeScript 类型包 | `@types/xxx` 只需 `devDependencies` | 但运行时包必须在 `dependencies` |

---

## 十二、关键文件说明

| 文件 | 位置 | 说明 |
|------|------|------|
| `cleanup.json` | 部署仓库根目录 | CI 自动生成的清理清单 |
| `post-upgrade.cjs` | 部署仓库根目录 | 升级后置脚本（可选） |
| `version.json` | `data/version.json` | 系统版本号 |
| `pre-upgrade-*.zip` | `backups/` | 升级前自动备份 |
| `generate-cleanup.js` | `scripts/` | CI 构建脚本 |
| `build-deploy.yml` | `.github/workflows/` | CI 配置文件 |
| `scripts/deploy/Dockerfile` | 源码仓库 | 部署专用 Dockerfile（扁平路径） |
| `msl.js` | 部署仓库根目录 | 容器管理终端工具 |
| `startup-check.js` | 部署仓库根目录 | 开机自检脚本 |
| `startup.sh` | 部署仓库根目录 | 启动脚本 |