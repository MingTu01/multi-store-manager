# Multi Shop Link - 升级包管理规范

## 一、版本号规则

### 1.1 版本格式
```
v主版本.次版本.修订号
```

- **主版本（Major）**：重大架构变更或不兼容更新，由管理员手动指定
- **次版本（Minor）**：新功能、功能增强，**每次更新必须递增**
- **修订号（Patch）**：Bug 修复、小改动，**每次更新必须递增**

### 1.2 版本号递增规则

| 场景 | 版本变化 | 示例 |
|------|----------|------|
| 新功能 | Minor +1，Patch 归零 | v1.0.2 → v1.1.0 |
| Bug 修复 | Patch +1 | v1.0.2 → v1.0.3 |
| 重大更新 | Major +1，Minor/Patch 归零 | v1.0.2 → v2.0.0 |

### 1.3 版本号存储位置

每次更新必须同步修改以下文件：
1. `apps/server/package.json` — 服务端版本
2. `apps/web/index.html` — 前端构建时间戳

## 二、升级包规范

### 2.1 打包方式

使用 Node.js + adm-zip 打包，**禁止使用 PowerShell Compress-Archive**（会产生反斜杠路径导致 Linux 解压失败）。

```bash
cd apps/web && npx vite build  # 先构建前端
```

### 2.2 ZIP 结构

升级包必须包含以下目录：

```
├── package.json        # { name, version }
├── web-dist/           # 前端构建产物（apps/web/dist/*）
└── server-src/         # 后端源码（apps/server/src/*）
```

### 2.3 升级流程

1. 备份当前数据库
2. 解压 ZIP 覆盖 `web-dist/` 和 `server-src/`
3. 更新 `data/version.json` 中的版本号
4. 重启服务

## 三、部署方式

### 3.1 1Panel Docker 部署

```bash
# 上传 ZIP 到容器
docker cp multi-shop-link-vX.X.X.zip <容器名>:/tmp/

# 解压覆盖
docker exec <容器名> sh -c "cd /tmp && unzip multi-shop-link-vX.X.X.zip -d extract && cp -r extract/web-dist/* /app/public/web-dist/ && cp -r extract/server-src/* /app/src/"

# 重启容器
docker restart <容器名>
```

### 3.2 在线升级

通过管理后台 → 系统设置 → 系统升级，支持：
- 在线更新（从 GitHub 拉取最新版本）
- ZIP 上传升级

## 四、注意事项

- 构建前必须删除 `dist` 目录
- 所有文件使用 UTF-8 无 BOM 编码
- 打包必须用 Node.js（adm-zip 或 tar），不能用 PowerShell
- 生产环境部署后需要清除浏览器缓存（Service Worker）
