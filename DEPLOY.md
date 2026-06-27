# Multi Shop Link - 部署文档

## 服务器环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 9+ |
| 管理面板 | 1Panel（推荐） |
| 内存 | 1GB+（推荐 2GB） |
| 磁盘 | 5GB+ 可用空间 |
| Node.js | 20+（Docker 镜像自带） |

---

## 一、首次部署（Docker Compose 方式）

### 1.1 克隆部署仓库

```bash
cd /opt
git clone https://gh.llkk.cc/https://github.com/MingTu01/multi-shop-link-deploy.git
cd multi-shop-link-deploy
```

### 1.2 配置环境变量

```bash
cp .env.example .env
vi .env
```

必须配置：
- `JWT_SECRET` — JWT 认证密钥（任意随机字符串）
- `CORS_ORIGIN` — 允许的前端域名（如 `https://msl.908521.xyz`）

### 1.3 构建并启动

```bash
docker-compose up -d --build
```

### 1.4 验证

```bash
# 查看容器状态
docker ps | grep multi-shop-link

# 查看启动日志（包含开机自检结果）
docker logs multi-shop-link

# 进入容器管理工具
docker exec -it multi-shop-link msl
```

访问 `http://服务器IP:3001`，默认管理员：`admin / 123456`

---

## 二、容器管理工具（msl）

容器内置 `msl` 终端管理工具：

```bash
docker exec -it multi-shop-link msl
```

### 2.1 功能菜单

| 选项 | 功能 | 说明 |
|------|------|------|
| 1 | 系统信息 | 版本、运行时间、数据统计 |
| 2 | 备份数据库 | 创建数据库备份 |
| 3 | 恢复数据库 | 从备份恢复 |
| 4 | 重置管理员密码 | 重置 admin 密码为默认值 |
| 5 | 查看最近日志 | 查看应用日志 |
| 6 | 清理临时文件 | 清理 uploads 中的临时文件 |
| 7 | 数据库维护 | WAL checkpoint、VACUUM |
| 8 | 更新系统 | 在线更新到最新版本 |
| 9 | 版本回退 | 回退到指定版本 |
| A | 诊断修复 | 自动检测并修复常见问题 |
| 0 | 退出 | 退出 msl 工具 |

### 2.2 开机自检

容器启动时自动运行 `startup-check.js`，检查项目：

| 检查项 | 说明 |
|--------|------|
| package.json | 格式正确性、BOM 检测 |
| version.json | 版本文件存在性 |
| 数据目录 | data/uploads/backups 完整性 |
| 数据库 | 可访问性、表结构 |
| 管理员账户 | admin 账户存在性 |
| JWT Secret | 密钥文件存在性和长度 |
| 前端文件 | index.html 和 JS bundle |
| Service Worker | sw.js 存在性 |
| WAL 文件 | 大小检查（>10MB 自动 checkpoint） |
| node_modules | 依赖目录存在性 |
| 环境变量 | NODE_ENV/PORT/JWT_SECRET |

自检结果在容器日志中显示：
```bash
docker logs multi-shop-link
```

---

## 三、系统升级

### 3.1 在线升级（推荐）

管理后台 → 系统设置 → 系统升级 → 检查更新

系统会自动：
1. 备份数据库
2. 下载最新版本
3. 校验完整性
4. 清理废旧文件
5. 更新代码
6. 重启服务

### 3.2 完整重建（依赖变更时）

```bash
cd /opt/multi-shop-link-deploy
git pull
docker-compose up -d --build
```

### 3.3 手动热更新（调试用）

```powershell
# 前端
cd apps/web; npx vite build
docker cp apps/web/dist/. multi-shop-link:/app/public/web-dist/

# 后端
docker cp apps/server/src/routes/xxx.ts multi-shop-link:/app/src/routes/xxx.ts
docker restart multi-shop-link
```

详见 [UPGRADE.md](UPGRADE.md)

---

## 四、数据备份

### 4.1 手动备份

管理后台 → 系统设置 → 数据备份 → 创建备份

### 4.2 自动备份

管理后台 → 系统设置 → 数据备份 → 启用自动备份

### 4.3 备份文件位置

```
/app/data/store.db          # 数据库
/app/backups/               # 备份目录
```

---

## 五、常见问题

### 5.1 端口被占用

```bash
netstat -tlnp | grep 3001
kill -9 <PID>
```

### 5.2 数据库锁定

```bash
rm -f /app/data/store.db-wal /app/data/store.db-shm
docker restart multi-shop-link
```

### 5.3 容器启动崩溃：MODULE_NOT_FOUND

```bash
# 进入容器安装缺失依赖
docker exec -it multi-shop-link npm install <missing-package> --omit=dev

# 或完整重建
cd /opt/multi-shop-link-deploy && git pull && docker-compose up -d --build
```

### 5.4 msl 命令不存在

```bash
# 检查文件是否存在
docker exec multi-shop-link ls -la /app/msl.js /app/startup-check.js /app/startup.sh

# 如果不存在，需要重新构建
cd /opt/multi-shop-link-deploy && git pull && docker-compose up -d --build
```

### 5.5 升级后页面空白

1. Ctrl + Shift + R 强制刷新
2. F12 → Application → Service Workers → Unregister
3. 清除浏览器缓存后重新访问

### 5.6 内存不足

```bash
# 在 docker-compose.yml 中添加
environment:
  - NODE_OPTIONS=--max-old-space-size=512
```