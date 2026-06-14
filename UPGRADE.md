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
1. `apps/server/data/version.json` — 系统读取的版本号
2. `apps/server/package.json` — 服务端包版本
3. `apps/web/package.json` — 前端包版本
4. `package.json` — 根目录包版本

---

## 二、升级包规范

### 2.1 升级包类型
**只使用升级包，不使用全量包。**

| 类型 | 说明 | 是否使用 |
|------|------|----------|
| 升级包 | 只包含代码变更，不含静态资源 | ✅ 推荐 |
| 全量包 | 包含所有文件（含OCR模型等） | ❌ 仅首次部署使用 |

### 2.2 升级包命名规则
```
multi-shop-link-upgrade-v{版本号}.zip
```

示例：
- `multi-shop-link-upgrade-v1.0.3.zip`
- `multi-shop-link-upgrade-v1.1.0.zip`

### 2.3 升级包内容
升级包 **只包含** 以下内容：
```
multi-shop-link-upgrade-vX.X.X.zip
├── package.json                    # 根目录版本信息
├── apps/
│   ├── server/
│   │   ├── package.json            # 服务端版本信息
│   │   ├── src/                    # 服务端源码（全部）
│   │   └── public/
│   │       └── web-dist/           # 前端构建产物
│   └── web/
│       └── dist/                   # 前端构建产物（备份）
```

### 2.4 升级包排除项
以下文件 **不包含** 在升级包中：
- `node_modules/` — 依赖包（服务器已有）
- `data/` — 数据库文件（用户数据）
- `uploads/` — 上传的文件（用户数据）
- `backups/` — 备份文件
- `*.traineddata` — OCR模型文件（7MB+，极少变更）
- `logo.png`、`logo-192.png`、`logo-64.png` — 大尺寸图片
- `*.db`、`*.db-wal`、`*.db-shm` — 数据库文件
- `*.zip` — 其他压缩包

### 2.5 升级包大小参考
| 包类型 | 典型大小 | 说明 |
|--------|----------|------|
| 升级包 | 0.5-2 MB | 只含代码变更 |
| 全量包 | 8-10 MB | 含OCR模型等静态资源 |

---

## 三、升级包制作流程

### 3.1 自动打包（推荐）
使用项目内置的打包脚本：
```bash
cd apps/server
node build-upgrade.cjs
```

脚本会自动：
1. 读取当前版本号
2. 打包代码变更到 ZIP
3. 输出升级包文件

### 3.2 手动打包
如果脚本不可用，手动创建：
```bash
# 1. 修改版本号（4个文件）
# 2. 构建前端
cd apps/web
npm run build

# 3. 复制前端到服务器目录
cp -r dist/* ../server/public/web-dist/

# 4. 创建升级包（排除大文件）
cd ../..
zip -r multi-shop-link-upgrade-vX.X.X.zip \
  package.json \
  apps/server/package.json \
  apps/server/src/ \
  apps/server/public/web-dist/ \
  apps/web/dist/ \
  -x "node_modules/*" "*.db" "*.traineddata"
```

### 3.3 版本号更新检查清单
- [ ] `apps/server/data/version.json` 已更新
- [ ] `apps/server/package.json` 已更新
- [ ] `apps/web/package.json` 已更新
- [ ] `package.json` 已更新
- [ ] 版本号符合递增规则

---

## 四、升级流程

### 4.1 通过 Web 界面升级（推荐）
1. 管理员登录 → 系统设置 → 系统升级
2. 选择升级包 ZIP 文件
3. 系统自动验证：
   - 检查 ZIP 格式是否有效
   - 读取升级包版本号
   - 显示版本对比信息
4. 点击「开始升级」
5. 上传进度条显示上传速度
6. 系统自动执行：
   - 备份数据库
   - 解压升级包
   - 更新版本信息
   - 覆盖系统文件
   - 重启服务
7. 升级完成后自动清理临时文件
8. 点击「确认」刷新页面

### 4.2 升级过程监控
升级过程中会显示：
- 上传进度百分比和速度（MB/s 或 KB/s）
- 每个步骤的执行状态
- 完成状态和确认按钮

### 4.3 升级后自动清理
以下操作会自动清理服务器上的临时文件：
- 升级成功后点击「确认」
- 关闭升级弹窗
- 升级失败后关闭弹窗

清理内容：
- `uploads/extract-*/` 目录（解压的临时文件）

---

## 五、回滚方案

### 5.1 自动备份
升级前系统会自动创建备份：
```
backups/pre-upgrade-{时间戳}.zip
```

### 5.2 手动回滚
如果升级失败：
1. 系统设置 → 数据备份
2. 找到升级前的备份文件
3. 点击「恢复」
4. 确认恢复
5. 系统自动重启

---

## 六、常见问题

### Q: 升级包上传失败
**A:** 检查网络连接，确保 ZIP 文件完整。升级包大小通常 < 2MB。

### Q: 升级后版本号没有变化
**A:** 检查升级包中的 `package.json` 版本号是否正确。系统会读取第一个找到的 `package.json`。

### Q: 升级后页面白屏
**A:** 清除浏览器缓存，或使用无痕模式访问。PWA 缓存可能导致旧版本资源被使用。

### Q: 数据库会丢失吗
**A:** 不会。升级包不包含数据库文件，升级前会自动备份数据库。

### Q: 可以跨版本升级吗
**A:** 可以。系统会直接覆盖文件，不依赖版本连续性。但建议按顺序升级。

---

## 七、升级包验证

### 7.1 验证命令
检查升级包内容：
```bash
# 查看 ZIP 内容
unzip -l multi-shop-link-upgrade-vX.X.X.zip

# 检查版本号
unzip -p multi-shop-link-upgrade-vX.X.X.zip package.json | grep version
```

### 7.2 验证清单
- [ ] ZIP 文件可以正常解压
- [ ] 包含 `apps/server/src/` 目录
- [ ] 包含 `apps/server/public/web-dist/` 目录
- [ ] `package.json` 版本号正确
- [ ] 不包含数据库文件
- [ ] 不包含 OCR 模型文件
- [ ] 文件大小 < 2MB

---

## 八、附录

### 8.1 当前版本信息
- 当前版本：v1.0.2
- 升级包大小：约 0.86 MB
- 全量包大小：约 9.14 MB（仅首次部署使用）

### 8.2 相关文件
- `apps/server/src/routes/system.ts` — 升级 API 实现
- `apps/web/src/pages/settings/SettingsPage.tsx` — 升级界面
- `apps/server/data/version.json` — 版本信息存储

### 8.3 升级 API 端点
| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/system/upgrade/validate` | POST | 验证升级包 |
| `/api/system/upgrade` | POST | 执行升级 |
| `/api/system/upgrade/status` | GET | 查询升级状态 |
| `/api/system/upgrade/cleanup` | POST | 清理临时文件 |
| `/api/system/upgrade/stream` | GET | SSE 实时进度 |
