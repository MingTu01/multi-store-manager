# 多店管理系统 - 部署文档

## 服务器环境要求

| 项目 | 要求 |
|------|------|
| 操作系统 | CentOS 7+ / Ubuntu 18+ / Debian 9+ |
| Node.js | v18.0.0 或更高版本 |
| 内存 | 1GB+（推荐2GB） |
| 磁盘 | 5GB+ 可用空间 |
| 管理面板 | 1Panel（推荐） |

---

## 一、首次部署

### 1.1 安装 Node.js

SSH 登录服务器，执行：

```bash
# 安装 Node.js 18
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# 验证安装
node -v    # 应显示 v18.x.x
npm -v     # 应显示 9.x.x 或更高
```

### 1.2 安装 PM2（进程管理器）

```bash
npm install -g pm2

# 设置开机自启
pm2 startup
pm2 save
```

### 1.3 上传项目文件

**方式一：通过 1Panel 文件管理器**
1. 登录 1Panel → 文件管理
2. 进入 `/opt` 目录
3. 创建文件夹 `multi-store-manager`
4. 上传 \`multi-store-manager-v1.0.0.zip\` 到该目录

**方式二：通过 SCP**
```bash
scp multi-store-manager-v1.0.0.zip root@你的服务器IP:/opt/multi-store-manager/
```

### 1.4 解压项目

```bash
cd /opt/multi-store-manager
unzip multi-store-manager-v1.0.0.zip
```

### 1.5 安装依赖并构建

```bash
# 安装后端依赖
cd /opt/multi-store-manager/apps/server
npm install --production

# 安装前端依赖并构建
cd /opt/multi-store-manager/apps/web
npm install
npm run build

# 回到项目根目录
cd /opt/multi-store-manager
```

### 1.6 启动服务

```bash
# 方式一：使用 PM2 启动（推荐）
cd /opt/multi-store-manager
pm2 start ecosystem.config.cjs

# 方式二：手动启动
cd /opt/multi-store-manager/apps/server
node --import tsx src/index.ts
```

### 1.7 验证服务

```bash
# 查看 PM2 状态
pm2 status

# 查看日志
pm2 logs multi-store-manager

# 测试访问
curl http://localhost:3001
```

### 1.8 配置 1Panel 反向代理

1. 登录 1Panel → 网站 → 反向代理
2. 创建反向代理：
   - 名称：`multi-store-manager`
   - 目标 URL：`http://127.0.0.1:3001`
   - 域名：填写你的域名
3. 保存后等待 SSL 证书自动签发（如需要）

### 1.9 验证部署

浏览器访问 \`https://你的域名\`

**默认管理员账号**
- 账号：\`admin\`
- 密码：\`123456\`

登录后请立即修改默认密码。

---

## 二、升级部署

### 2.1 上传升级包

上传新的 ZIP 文件到服务器任意目录（如 \`/tmp\`）。

### 2.2 执行升级

```bash
# 停止服务
cd /opt/multi-store-manager
pm2 stop multi-store-manager

# 备份数据库（重要！）
cp apps/server/data/store.db /opt/multi-store-manager/backups/store.db.bak

# 解压覆盖（保留数据目录）
unzip -o /tmp/multi-store-manager-vX.X.X.zip -d /opt/multi-store-manager

# 安装新依赖（如果有变化）
cd /opt/multi-store-manager/apps/server
npm install --production
cd /opt/multi-store-manager/apps/web
npm install
npm run build

# 重启服务
cd /opt/multi-store-manager
pm2 restart multi-store-manager
```

### 2.3 或使用 Web 界面升级

1. 管理员登录 → 系统设置 → 系统升级
2. 点击"选择文件"，选择 ZIP 升级包
3. 点击"开始升级"，等待进度完成
4. 点击"确认"，页面自动刷新

---

## 三、数据备份与恢复

### 3.1 自动备份

系统内置自动备份功能：
1. 管理员登录 → 系统设置 → 数据备份
2. 开启"自动备份"，选择频率（每小时/每天/每周）
3. 设置保留份数（默认30份）
4. 保存设置

自动备份文件保存在 \`apps/server/backups/\` 目录。

### 3.2 手动备份

1. 管理员登录 → 系统设置 → 数据备份
2. 点击"立即备份"
3. 备份完成后可下载 ZIP 文件

### 3.3 数据恢复

1. 系统设置 → 数据备份 → 选择要恢复的备份
2. 点击"恢复" → 确认弹窗 → 点击"确认恢复"
3. 系统自动重启，页面自动刷新

### 3.4 命令行备份（推荐定期执行）

```bash
# 创建备份脚本
cat > /opt/multi-store-manager/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/multi-store-manager/backups"
mkdir -p $BACKUP_DIR

# WAL checkpoint
sqlite3 /opt/multi-store-manager/apps/server/data/store.db "PRAGMA wal_checkpoint(TRUNCATE);"

# 复制数据库
cp /opt/multi-store-manager/apps/server/data/store.db $BACKUP_DIR/manual-$DATE.db

# 保留最近30份
ls -t $BACKUP_DIR/manual-*.db | tail -n +31 | xargs rm -f 2>/dev/null

echo "备份完成: manual-$DATE.db"
EOF

chmod +x /opt/multi-store-manager/backup.sh

# 添加定时任务（每天凌晨3点备份）
crontab -e
# 添加以下行：
0 3 * * * /opt/multi-store-manager/backup.sh >> /var/log/backup.log 2>&1
```

---

## 四、消息推送配置

### 4.1 企业微信自建应用（推荐）

1. 企业微信管理后台 → 应用管理 → 自建 → 创建应用
2. 获取以下信息：
   - \`CorpID\`：企业ID
   - \`AgentID\`：应用AgentId
   - \`Secret\`：应用Secret
   - \`UserID\`：接收人的企业微信UserID

3. 配置可信域名（你的代理地址）：
   - 应用管理 → 接收消息 → 设置API接收
   - URL填写：\`https://你的代理地址/wecom/callback\`
   - Token和EncodingAESKey系统自动生成

4. 系统配置：
   - 管理员登录 → 系统设置 → 消息推送
   - 或店铺内 → 设置 → 消息推送
   - 填写 CorpID、AgentID、Secret、UserID、代理URL
   - 点击"测试"验证
   - 勾选需要推送的内容
   - 保存

### 4.2 代理服务器配置

如果服务器无法直接访问企业微信API，需要配置代理：

```bash
# 使用 Nginx 反代企业微信API（在 1Panel 中配置）
# 目标URL: https://qyapi.weixin.qq.com
# 保留路径: 是
```

### 4.3 PushPlus

1. 访问 pushplus.plus 注册账号
2. 获取 Token
3. 系统设置 → 消息推送 → PushPlus → 填写Token → 测试

### 4.4 Server酱

1. 访问 sct.ftqq.com 注册账号
2. 获取 SendKey
3. 系统设置 → 消息推送 → Server酱 → 填写Key → 测试

---

## 五、PWA 安装（手机端）

1. 手机浏览器访问系统地址
2. 点击浏览器菜单 → "添加到主屏幕" / "安装应用"
3. 输入应用名称 → 确认
4. 桌面出现应用图标，打开后为全屏原生体验

**支持系统**
- iOS 12+：Safari → 分享 → 添加到主屏幕
- Android 5+：Chrome → 菜单 → 安装应用
- Chrome/Firefox/Edge 均支持

---

## 六、常用运维命令

```bash
# 查看服务状态
pm2 status

# 重启服务
pm2 restart multi-store-manager

# 停止服务
pm2 stop multi-store-manager

# 查看日志
pm2 logs multi-store-manager

# 实时日志
pm2 logs multi-store-manager --lines 100

# 保存进程列表（服务器重启后自动恢复）
pm2 save

# 清空日志
pm2 flush multi-store-manager
```

---

## 七、故障排查

| 问题 | 解决方案 |
|------|---------|
| 页面白屏 | `pm2 restart multi-store-manager` |
| 端口被占用 | `lsof -i :3001` 查看占用进程 |
| 数据库锁定 | `sqlite3 apps/server/data/store.db "PRAGMA wal_checkpoint(TRUNCATE);"` |
| 内存不足 | `pm2 restart multi-store-manager --max-memory-restart 512M` |
| 升级后版本未更新 | 检查 `apps/server/data/version.json` 文件是否存在 |
| 图片上传失败 | 检查 `apps/server/uploads` 目录权限 |
| 推送失败 | 检查网络是否能访问企业微信API，配置代理 |

---

## 八、目录结构

```
/opt/multi-store-manager/
├── apps/
│   ├── server/          # 后端
│   │   ├── src/         # 源代码
│   │   ├── data/        # 数据库文件（重要！勿删）
│   │   ├── backups/     # 备份文件
│   │   └── uploads/     # 上传文件
│   └── web/             # 前端
│       ├── dist/        # 构建产物
│       └── src/         # 源代码
├── deploy.sh            # 一键部署脚本
├── ecosystem.config.cjs # PM2配置
├── package.json         # 根配置
└── .env.example         # 环境变量模板
```

---

## 九、安全建议

1. **修改默认密码**：首次登录后立即修改 admin 密码
2. **HTTPS**：通过 1Panel 配置 SSL 证书
3. **防火墙**：仅开放 80/443 端口，屏蔽 3001 端口外网访问
4. **定期备份**：配置自动备份，保留最近30份
5. **系统更新**：及时更新到最新版本

```bash
# 防火墙示例（firewalld）
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --permanent --add-port=443/tcp
firewall-cmd --reload
```
