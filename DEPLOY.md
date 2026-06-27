# Multi Shop Link - 部署文档

## 服务器环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 9+ |
| 管理面板 | 1Panel（推荐） |
| 内存 | 1GB+（推荐 2GB） |
| 磁盘 | 5GB+ 可用空间 |
| Node.js | 18+ 或 22+ |

---

## 一、首次部署（1Panel Docker 方式）

### 1.1 上传项目

通过 1Panel 文件管理器上传 `multi-shop-link-vX.X.X.zip` 到 `/opt/` 目录。

### 1.2 解压项目

```bash
cd /opt
unzip multi-shop-link-vX.X.X.zip -d multi-shop-link
cd multi-shop-link
```

### 1.3 安装依赖并构建

```bash
cd apps/server && npm install
cd ../web && npm install && npx vite build
```

### 1.4 创建 Docker 容器

在 1Panel → **容器** → **创建容器**：

| 配置项 | 值 |
|--------|-----|
| 容器名称 | multi-shop-link |
| 镜像 | node:20-slim |
| 端口映射 | 3001:3001 |
| 数据卷 | /opt/multi-shop-link/apps/server/data:/app/data |
| 重启策略 | unless-stopped |
| 启动命令 | sh -c "cd /app && npm install && node --import tsx src/index.ts" |

### 1.5 验证

访问 `http://服务器IP:3001`，默认管理员：`admin / 123456`

---

## 二、数据备份

### 2.1 手动备份

管理后台 → 系统设置 → 数据备份 → 创建备份

### 2.2 自动备份

管理后台 → 系统设置 → 数据备份 → 启用自动备份

### 2.3 备份文件位置

```
/app/data/store.db          # 数据库
/app/backups/               # 备份目录
```

---

## 三、系统升级

### 3.1 ZIP 升级

1. 上传升级包到管理后台 → 系统设置 → 系统升级
2. 选择 ZIP 文件并上传
3. 验证通过后点击升级

### 3.2 在线升级

管理后台 → 系统设置 → 系统升级 → 检查更新

---

## 四、常见问题

### 4.1 端口被占用

```bash
# 查找占用端口的进程
netstat -tlnp | grep 3001
# 杀掉进程
kill -9 <PID>
```

### 4.2 数据库锁定

```bash
# 删除 WAL 和 SHM 文件
rm -f /app/data/store.db-wal /app/data/store.db-shm
```

### 4.3 内存不足

```bash
# 设置 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=512" node --import tsx src/index.ts
```

## 五、开发热更新（不重建镜像）

开发调试时，直接把修改后的文件复制到运行中的容器，避免重复 docker build。

### 5.1 前端热更新

```powershell
# 1. 构建前端
cd "D:\文档\MSL\multi-store-manager\apps\web"
npx vite build

# 2. 复制到容器
docker cp "D:\文档\MSL\multi-store-manager\apps\web\dist\." multi-shop-link:/app/public/web-dist/

# 3. 浏览器强制刷新 (Ctrl+Shift+R) 即可看到最新前端
```

> 前端改动不需要重启容器，只要文件替换后浏览器刷新即可。

### 5.2 后端热更新

```powershell
# 1. 复制修改后的后端文件到容器（按需替换具体文件）
docker cp "D:\文档\MSL\multi-shop-link-deploy\src\routes\system.ts" multi-shop-link:/app/src/routes/system.ts

# 2. 重启容器使后端代码生效
docker restart multi-shop-link
```

### 5.3 前后端同时更新

```powershell
# 前端
cd "D:\文档\MSL\multi-store-manager\apps\web"; npx vite build
docker cp "D:\文档\MSL\multi-store-manager\apps\web\dist\." multi-shop-link:/app/public/web-dist/

# 后端
docker cp "D:\文档\MSL\multi-shop-link-deploy\src\routes\system.ts" multi-shop-link:/app/src/routes/system.ts

# 重启
docker restart multi-shop-link
```

### 5.4 同步到部署仓库

热更新验证通过后，记得把修改同步到部署仓库：

```powershell
# 同步前端
Remove-Item -Recurse -Force "D:\文档\MSL\multi-shop-link-deploy\public\web-dist" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "D:\文档\MSL\multi-store-manager\apps\web\dist" "D:\文档\MSL\multi-shop-link-deploy\public\web-dist"

# 同步后端（源码直接从 monorepo 复制）
Copy-Item -Force "D:\文档\MSL\multi-store-manager\apps\server\src\routes\system.ts" "D:\文档\MSL\multi-shop-link-deploy\src\routes\system.ts"
```
---

## 六、热更新方式（推荐）

当无法使用在线更新或需要快速修复时，可以直接替换容器内的文件：

### 前端热更新

```powershell
# 构建前端
cd "D:\文档\MSL\multi-store-manager\apps\web"
npx vite build

# 复制到容器
docker cp "D:\文档\MSL\multi-store-manager\apps\web\dist\." multi-shop-link:/app/public/web-dist/

# 重启容器
docker restart multi-shop-link
```

### 后端热更新

```powershell
# 复制单个文件
docker cp "D:\文档\MSL\multi-store-manager\apps\server\src\routes\system.ts" multi-shop-link:/app/src/routes/system.ts
docker restart multi-shop-link
```

### 注意事项

- 热更新不会更新 `node_modules`，如果依赖有变化需要重新构建镜像
- 热更新后容器内的旧 JS 文件不会自动清理，可能需要手动清理
- 前端文件名包含 hash，旧文件不会被覆盖但也不会被引用
