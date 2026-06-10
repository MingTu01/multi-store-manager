# 多店管理系统 (Multi-Store Manager)

> 适用于多门店经营的综合管理平台，支持桌面端和移动端PWA，iOS原生UI风格

## 功能特性

### 管理端（ADMIN）
- **管理大屏** - 全店收支总览、环比同比、收入支出构成饼图、门店对比
- **门店管理** - 创建/编辑/删除门店、股东信息、员工数量
- **操作日志** - 全局操作记录，支持按门店/时间/操作类型筛选
- **系统设置** - 数据备份恢复、ZIP升级、消息推送配置、权限说明

### 店铺端（按角色权限）
- **总览** - 今日收支、快捷操作、最近记账
- **记账** - 收入支出记录、分类管理、日/周/月/年/总筛选
- **盘点** - 物品条目管理、盘点模式、库存同步、差异标注
- **开闭店** - 拍照确认、交接内容、历史记录
- **报表** - 收入支出构成、同比环比、对比柱状图
- **员工管理** - 员工信息、头像、岗位、工资设定
- **工资** - 自动生成工资单、修改确认、工资条
- **分红** - 按股东占比自动计算分红
- **日志** - 门店操作记录
- **账户** - 修改密码、个人信息

### 权限模型
| 角色 | 权限范围 |
|------|---------|
| ADMIN | 全部页面和功能 |
| MANAGER | 门店全部页面（除分红） |
| STAFF | 总览、记账、盘点、开闭店 |
| SHAREHOLDER | 只读分红和报表 |

### 技术特性
- 📱 PWA支持，可安装到手机桌面
- 🖥️ 桌面端+移动端自适应布局
- 🔔 微信消息推送（企业微信自建应用）
- 💾 自动/手动/升级前数据备份
- 🔄 ZIP包在线升级
- 🌐 全中文界面

## 快速开始

### 环境要求
- Node.js 18+
- pnpm (推荐) 或 npm

### 安装

```bash
git clone https://github.com/MingTu01/multi-store-manager.git
cd multi-store-manager

# 安装依赖
pnpm install

# 构建前端
cd apps/web
npx vite build
cd ../..

# 启动服务
cd apps/server
node --import tsx src/index.ts
```

访问 http://localhost:3001

### 测试账号
| 账号 | 密码 | 角色 |
|------|------|------|
| admin | 123456 | 管理员 |
| 13900000001 | 123456 | 店长(城南旗舰店) |
| 13900000002 | 123456 | 员工(城南旗舰店) |

## 部署指南（阿里云 + 1Panel）

### 1. 服务器准备
```bash
# 购买阿里云ECS（推荐2核4G）
# 安装1Panel面板
curl -sSL https://resource.fit2cloud.com/1panel/v2/install.sh -o install.sh && bash install.sh
```

### 2. 安装Node.js环境
```bash
# 通过1Panel → App Store 安装 Node.js
# 或手动安装
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. 部署应用
```bash
# 上传项目到服务器
cd /opt/multi-store-manager

# 安装依赖
pnpm install

# 构建前端
cd apps/web && npx vite build && cd ../..

# 使用 PM2 启动
pm2 start "node --import tsx src/index.ts" --name multi-store -w apps/server

# 设置开机自启
pm2 save
pm2 startup
```

### 4. 配置Nginx反向代理（1Panel中操作）
- 域名：你的域名
- 反向代理：http://127.0.0.1:3001
- 启用HTTPS（Let's Encrypt）

## 升级说明

### 方式一：Web端ZIP升级（推荐）
1. 管理员登录 → 系统设置 → 系统升级
2. 上传新的ZIP升级包
3. 系统自动验证并执行升级
4. 升级完成自动刷新页面

### 方式二：SSH命令行升级
```bash
cd /opt/multi-store-manager
git pull
cd apps/web && npx vite build && cd ../..
pm2 restart multi-store
```

### ZIP升级包格式
```
multi-store-upgrade-vX.X.X.zip
├── apps/
│   ├── server/
│   │   ├── src/          # 后端源码
│   │   ├── package.json
│   │   └── ...
│   └── web/
│       ├── dist/         # 已构建的前端
│       ├── package.json
│       └── ...
├── upgrade.json          # 升级信息 {version, description}
└── package.json
```

## 备份恢复

### 三种备份方式
1. **自动备份** - 按设定频率自动备份（每小时/每天/每周）
2. **手动备份** - 在系统设置中手动触发
3. **升级前备份** - 升级系统时自动创建

### 备份格式
备份文件为ZIP包，包含：
- `store.db` - SQLite数据库
- `store.db-wal` - WAL日志文件
- `store.db-shm` - 共享内存文件

### 恢复流程
1. 系统设置 → 数据备份 → 找到目标备份
2. 点击恢复 → 二次确认
3. 系统自动备份当前数据 → 恢复备份 → 重启服务
4. 点击确认刷新页面

## 项目结构

```
multi-store-manager/
├── apps/
│   ├── server/           # Express后端
│   │   ├── src/
│   │   │   ├── index.ts      # 入口文件
│   │   │   ├── auth.ts       # JWT认证
│   │   │   ├── db.ts         # 数据库初始化
│   │   │   ├── oplog.ts      # 操作日志
│   │   │   ├── notify.ts     # 消息推送
│   │   │   └── routes/       # API路由
│   │   ├── data/              # SQLite数据库
│   │   └── public/            # 静态资源
│   └── web/             # React前端
│       ├── src/
│       │   ├── pages/         # 页面组件
│       │   ├── components/    # 通用组件
│       │   ├── layouts/       # 布局组件
│       │   ├── lib/           # 工具函数
│       │   └── stores/        # 状态管理
│       └── dist/              # 构建输出
├── AGENTS.md             # AI开发规范
├── ARCHITECTURE.md       # 系统架构文档
├── CONTRIBUTING.md       # 开发贡献指南
└── README.md             # 项目说明
```

## API概览

| 路由前缀 | 说明 | 认证 |
|----------|------|------|
| POST /api/auth/login | 登录 | 无 |
| GET /api/auth/me | 当前用户 | Bearer |
| PUT /api/auth/password | 修改密码 | Bearer |
| GET /api/stores | 门店列表 | Bearer |
| POST /api/stores | 创建门店 | ADMIN |
| GET /api/stores/:id | 门店详情 | Bearer |
| GET /api/stores/:id/entries | 记账列表 | Bearer |
| POST /api/stores/:id/entries | 新增记账 | Bearer |
| GET /api/dashboard | 管理大屏数据 | ADMIN |
| GET /api/logs | 操作日志 | Bearer |
| GET /api/system/backups | 备份列表 | ADMIN |

## License

MIT