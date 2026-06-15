# Multi Shop Link - 升级包管理规范

## 一、版本号规则

### 1.1 版本格式
```
v主版本.次版本.修订号
```

- **主版本（Major）**：重大架构变更或不兼容更新，由管理员手动指定
- **次版本（Minor）**：新功能、功能增强，**每次更新必须递增**
- **修订号（Patch）**：Bug修复、小改动，**每次更新必须递增**

### 1.2 版本号递增规则
| 场景 | 版本变化 | 示例 |
|------|----------|------|
| 新增功能 | Minor +1，Patch 归零 | v1.0.2 → v1.1.0 |
| Bug修复 | Patch +1 | v1.0.2 → v1.0.3 |
| 重大更新 | Major +1，Minor/Patch 归零 | v1.0.2 → v2.0.0 |

### 1.3 版本号存储位置
每次更新必须同步修改以下 **4个文件**：
1. `package.json` — 根目录版本（升级包从此读取版本号）
2. `apps/server/package.json` — 服务端版本
3. `apps/web/package.json` — 前端版本
4. `apps/server/data/version.json` — 系统运行时读取的版本

---

## 二、升级包规范

### 2.1 升级包类型
**只使用升级包，不使用全量包。**

| 类型 | 说明 | 是否使用 |
|------|------|----------|
| 升级包 | 只包含代码变更 | ✅ 推荐 |
| 全量包 | 包含所有文件（含OCR模型等） | ❌ 仅首次部署使用 |

### 2.2 升级包命名规则
```
multi-shop-link-upgrade-v{版本号}.zip
```

示例：
- `multi-shop-link-upgrade-v1.0.3.zip`
- `multi-shop-link-upgrade-v1.1.0.zip`

### 2.3 升级包内容（必须严格按此结构）

**重要：路径必须精确匹配，服务器代码按这些路径查找文件！**

```
multi-shop-link-upgrade-vX.X.X.zip
├── package.json                    # 根目录版本信息（必须在ZIP根目录）
├── server-src/                     # 服务端源码（直接在此目录下）
│   ├── index.ts
│   ├── db.ts
│   ├── auth.ts
│   ├── routes/
│   ├── middleware/
│   └── ...
├── web-dist/                       # 前端构建产物（直接在此目录下）
│   ├── index.html
│   ├── assets/
│   └── ...
└── server-data/
    └── version.json                # 版本信息
```

**关键路径说明：**
| ZIP内路径 | 服务器目标路径 | 说明 |
|-----------|--------------|------|
| `package.json` | 读取版本号 | 升级验证从此读取 version 字段 |
| `server-src/*` | `apps/server/src/*` | 服务端代码覆盖 |
| `web-dist/*` | `apps/web/dist/*` | 前端构建产物覆盖 |
| `server-data/version.json` | `apps/server/data/version.json` | 运行时版本号 |

### 2.4 升级包排除项
以下文件 **不包含** 在升级包中：
- `node_modules/` — 依赖包（服务器已有）
- `data/` — 数据库文件（用户数据）
- `uploads/` — 上传的文件（用户数据）
- `backups/` — 备份文件
- `*.traineddata` — OCR模型文件（4MB+，极少变更）
- `logo.png`、`logo-192.png` — 大尺寸图片
- `*.db`、`*.db-wal`、`*.db-shm` — 数据库文件

### 2.5 升级包大小参考
| 包类型 | 典型大小 | 说明 |
|--------|----------|------|
| 升级包 | 0.5-3 MB | 只含代码变更 |
| 全量包 | 8-10 MB | 含OCR模型等（仅首次部署） |

---

## 三、升级包制作流程

### 3.1 自动打包（推荐）
使用项目内置的打包脚本：
```bash
cd apps/server
node build-upgrade.cjs
```

### 3.2 手动打包
```bash
# 1. 修改版本号（4个文件）
# 2. 构建前端
cd apps/web
npx vite build

# 3. 创建升级包（路径必须正确！）
cd ../..
zip -r multi-shop-link-upgrade-vX.X.X.zip \
  package.json \
  apps/server/src/ \
  apps/web/dist/ \
  apps/server/data/version.json

# 注意：ZIP内路径必须是 server-src/ 和 web-dist/
# 如果用 adm-zip，需要手动设置目标路径：
#   apps/server/src/* → server-src/*
#   apps/web/dist/* → web-dist/*
```

### 3.3 版本号更新检查清单
- [ ] `package.json` 已更新
- [ ] `apps/server/package.json` 已更新
- [ ] `apps/web/package.json` 已更新
- [ ] `apps/server/data/version.json` 已更新
- [ ] 版本号符合递增规则
- [ ] 前端已重新构建（`npx vite build`）
- [ ] ZIP内路径结构正确（`server-src/`、`web-dist/`）

---

## 四、升级流程

### 4.1 通过 Web 界面升级（推荐）
1. 管理员登录 → 系统设置 → 系统升级
2. 选择升级包 ZIP 文件
3. 系统自动验证：
   - 检查 ZIP 格式是否有效
   - 读取 `package.json` 中的版本号
   - 显示版本对比信息
4. 点击「开始升级」
5. 上传进度条显示上传速度
6. 系统自动执行：
   - 备份数据库
   - 解压升级包
   - 更新版本信息
   - 覆盖系统文件（`server-src/*` → `apps/server/src/*`，`web-dist/*` → `apps/web/dist/*`）
   - 重启服务
7. 升级完成后自动清理临时文件
8. 点击「确认」刷新页面

### 4.2 Docker 环境注意事项
在 Docker（1panel）环境下：
- `process.exit(0)` 会导致容器重启
- 升级包文件会覆盖到容器内对应路径
- 如果容器使用 volume 挂载，文件变更会持久化
- 如果没有挂载，容器重启后文件会丢失 → 需要重建镜像

**推荐方案：** 将 `apps/server/src`、`apps/web/dist`、`apps/server/data` 通过 volume 挂载。

### 4.3 升级后验证
升级后检查以下内容：
- [ ] 系统设置页显示正确版本号
- [ ] 运行时间已重置（说明重启成功）
- [ ] 前端页面正常加载
- [ ] 登录功能正常
- [ ] SSE 连接状态指示灯正常

---

## 五、回滚方案

### 5.1 自动备份
升级前系统会自动创建备份：
```
backups/pre-upgrade-{时间}.zip
```

### 5.2 手动回滚
如果升级失败：
1. 系统设置 → 数据备份
2. 找到升级前的备份文件
3. 点击「恢复」
4. 确认恢复
5. 系统自动重启

---


## Docker 容器目录结构

服务器运行在 Docker 容器中，目录结构如下：

```
/app/                          # BASE_DIR（服务器根目录）
├── package.json               # 版本信息
├── src/                       # 服务端源码
│   ├── index.ts
│   ├── db.ts
│   └── ...
├── public/
│   └── web-dist/              # 前端构建产物
│       ├── index.html
│       └── assets/
├── data/                      # 数据库（持久化卷）
│   ├── store.db
│   └── version.json
├── uploads/                   # 上传文件（持久化卷）
├── backups/                   # 备份文件
├── node_modules/              # 依赖包
├── chi_sim.traineddata        # OCR模型
└── eng.traineddata            # OCR模型
```

### 升级包路径映射

| ZIP内路径 | Docker内目标路径 | 说明 |
|-----------|-----------------|------|
| `package.json` | 读取版本号 | 不复制，仅读取 |
| `server-src/*` | `/app/src/*` | 服务端代码覆盖 |
| `web-dist/*` | `/app/public/web-dist/*` | 前端构建产物覆盖 |
| `server-data/version.json` | `/app/data/version.json` | 运行时版本号 |

### Docker 重启机制

升级完成后，服务器通过 `process.kill(process.pid, 'SIGTERM')` 发送 SIGTERM 信号给自己。
Docker 容器收到 SIGTERM 后，根据重启策略（`restart: always` 或 `restart: unless-stopped`）自动重启容器。

**注意：** 确保 Docker 容器设置了 `restart: always` 或 `restart: unless-stopped`。
`restart: on-failure` 可能不适用于所有场景。

## 六、常见问题

### Q: 升级包上传失败
**A:** 检查网络连接，确保 ZIP 文件完整。

### Q: 升级后版本号没有变化
**A:** 检查升级包中 `package.json` 版本号是否正确。

### Q: 升级后页面白屏
**A:** 清除浏览器缓存，或使用无痕模式访问。PWA 缓存可能导致旧版本资源被使用。

### Q: 升级后运行时间没有重置
**A:** 说明服务器没有重启。Docker 环境下需要手动重启容器。

### Q: 数据库会丢失吗
**A:** 不会。升级包不包含数据库文件，升级前会自动备份数据库。

### Q: 可以跨版本升级吗
**A:** 可以。系统会直接覆盖文件，不依赖版本连续性。

### Q: 升级包和全量包的区别
**A:** 升级包只包含代码变更（~2MB），全量包包含所有文件（~9MB）。升级用升级包，首次部署用全量包。
