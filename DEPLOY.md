# Multi Shop Link - 部署文档

## 服务器环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 9+ |
| 管理面板 | 1Panel（推荐） |
| 内存 | 1GB+（推荐 2GB） |
| 磁盘 | 5GB+ 可用空间 |

---

## 一、首次部署（1Panel 方式）

### 1.1 上传项目

通过 1Panel 文件管理器上传 `multi-shop-link-vX.X.X.zip` 到 `/opt/` 目录。

### 1.2 解压项目

在 1Panel 终端中执行：
```bash
cd /opt
unzip multi-shop-link-vX.X.X.zip -d multi-shop-link
```

### 1.3 创建 Node 运行环境

1. 1Panel → **运行环境** → **Node.js**
2. 点击 **创建运行环境**
3. 配置：
   - 版本：选择 **18.x** 或 **22.x**
   - 源码目录：`/opt/multi-shop-link/apps/server`
   - 启动命令：`node --import tsx src/index.ts`
   - 端口：`3001`
4. 点击 **确定**，1Panel 自动安装依赖并启动

### 1.4 配置反向代理

1. 1Panel → **网站** → **反向代理**
2. 创建反向代理：
   - 名称：`multi-shop-link`
   - 目标 URL：`http://127.0.0.1:3001`
   - 域名：填写你的域名
3. 保存后等待 SSL 证书自动签发

### 1.5 验证部署

浏览器访问 `https://你的域名`

**默认管理员账号：**
- 账号：`admin`
- 密码：`123456`

登录后请立即修改默认密码。

---

## 二、升级部署

### 2.1 通过 Web 界面升级（推荐）

1. 管理员登录 → 系统设置 → 系统升级
2. 选择升级方式：
   - **在线更新**：系统自动检查并下载新版本
   - **ZIP 升级**：手动上传升级包
3. 等待进度完成 → 确认刷新

详见 [UPGRADE.md](./UPGRADE.md)

### 2.2 通过 1Panel 手动升级

1. 1Panel → **运行环境** → 停止 Multi Shop Link
2. 1Panel → **文件管理** → 上传新的升级包 ZIP
3. 备份数据库：
   ```bash
   cp /opt/multi-shop-link/apps/server/data/store.db /opt/multi-shop-link/backups/store.db.bak
   ```
4. 解压覆盖：
   ```bash
   cd /opt
   unzip -o multi-shop-link-upgrade-vX.X.X.zip -d multi-shop-link
   ```
5. 1Panel → **运行环境** → 启动 Multi Shop Link

---

## 三、数据备份与恢复

### 3.1 自动备份

系统内置自动备份：
1. 管理员 → 系统设置 → 数据备份
2. 开启自动备份，选择频率（每小时/每天/每周）
3. 设置保留份数

### 3.2 手动备份

系统设置 → 数据备份 → 立即备份 → 下载 ZIP

### 3.3 数据恢复

系统设置 → 数据备份 → 选择备份 → 恢复 → 确认

---

## 四、消息推送配置

### 4.1 企业微信自建应用（推荐）

1. 企业微信管理后台 → 应用管理 → 自建 → 创建应用
2. 获取：CorpID、AgentID、Secret、UserID
3. 系统设置 → 消息推送 → 企业微信 → 填写配置 → 测试

### 4.2 PushPlus

系统设置 → 消息推送 → PushPlus → 填写 Token → 测试

### 4.3 Server酱

系统设置 → 消息推送 → Server酱 → 填写 SendKey → 测试

---

## 五、PWA 安装（手机端）

1. 手机浏览器访问系统地址
2. 点击浏览器菜单 → "添加到主屏幕" / "安装应用"
3. 桌面出现应用图标，打开后为全屏原生体验

---

## 六、常用运维（通过 1Panel）

| 操作 | 路径 |
|------|------|
| 启动/停止/重启 | 1Panel → 运行环境 → 操作按钮 |
| 查看日志 | 1Panel → 运行环境 → 日志 |
| 安装模块 | 1Panel → 运行环境 → 模块管理 |
| 文件管理 | 1Panel → 文件 |
| 域名/SSL | 1Panel → 网站 |
| 数据库备份 | 系统设置 → 数据备份 |

---

## 七、故障排查

| 问题 | 解决方案 |
|------|----------|
| 页面白屏 | 1Panel → 运行环境 → 重启 |
| 端口被占用 | 1Panel → 终端 → `lsof -i :3001` |
| 数据库锁定 | `sqlite3 apps/server/data/store.db "PRAGMA wal_checkpoint(TRUNCATE);"` |
| 图片上传失败 | 检查 `apps/server/uploads` 目录权限 |
| 推送失败 | 检查网络是否能访问企业微信 API |

---

## 八、安全建议

1. **修改默认密码**：首次登录后立即修改
2. **HTTPS**：通过 1Panel 配置 SSL 证书
3. **防火墙**：仅开放 80/443 端口
4. **定期备份**：配置自动备份
5. **系统更新**：及时更新到最新版本
