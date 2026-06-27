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
git clone https://github.com/MingTu01/multi-shop-link-deploy.git
cd multi-shop-link-deploy
```

### 1.2 启动容器

```bash
docker-compose up -d --build
```

### 1.3 验证

```bash
docker logs multi-shop-link --tail 20
```

默认管理员：admin / 123456

---

## 二、在线升级（推荐）

在管理页面 → 系统设置 → 系统升级 → 点击"检查更新"。

系统会自动从部署仓库拉取最新版本并重启。

---

## 三、手动升级（ZIP 方式）

1. 从 GitHub Releases 下载升级包
2. 在管理页面 → 系统设置 → 系统升级 → ZIP 升级
3. 上传 ZIP 文件，系统自动备份、解压、替换、重启

---

## 四、环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 服务端口 | 3001 |
| CORS_ORIGIN | 允许的跨域来源 | *（允许所有） |

如需限制跨域，设置：`CORS_ORIGIN=https://your-domain.com`

---

## 五、数据目录

| 路径 | 说明 |
|------|------|
| /app/data | 数据库 + 配置文件 |
| /app/uploads | 上传的图片 |
| /app/backups | 自动备份 |
| /app/public/web-dist | 前端静态文件 |

---

## 六、版本规范

- 版本格式：v主版本.次版本.修订号（如 v1.4.2）
- 当前阶段：v1.0.0 正式版已部署
- 次版本号：新增功能时递增
- 修订号：Bug 修复时递增
- 未经管理员确认，禁止将主版本号升到 2.0.0 或更高
