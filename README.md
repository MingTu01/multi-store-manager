# 多店管理系统 (Multi-Store Manager)

> 适用于多门店经营的综合管理平台，支持桌面端和移动端PWA，iOS原生UI风格

## 功能特性

### 管理端（ADMIN）
- **管理大屏** - 全店收支总览、环比同比、收入支出构成饼图、门店对比
- **门店管理** - 创建/编辑/删除门店、多张照片、股东信息（强制100%份额）、员工数量
- **操作日志** - 全局操作记录，支持按门店/时间/操作类型筛选
- **系统设置** - 数据备份恢复、ZIP升级、消息推送配置、权限说明

### 店铺端（按角色权限）
- **总览** - 今日收支、待办提醒（未确认工资/未盘点）、最近操作记录、快捷操作
- **记账** - 收入支出记录、分类管理、关键词搜索、分类筛选、金额区间筛选、日/周/月/年/总筛选
- **盘点** - 物品条目管理、拖动排序（dnd-kit）、领出功能、盘点模式、库存同步、差异标注
- **开闭店** - 拍照确认（多张）、交接内容、历史记录
- **报表** - 收入支出构成、同比环比、对比柱状图
- **员工管理** - 员工信息、头像拍照/上传、岗位、工资设定
- **工资** - 自动生成工资单、修改确认、工资条（含员工照片和岗位）
- **分红** - 按股东占比自动计算分红、可分红余额显示
- **日志** - 门店操作记录
- **账户** - 修改密码、个人信息、退出登录

### 角色权限
| 页面/功能 | 管理员 | 店长 | 员工 | 股东 |
|-----------|:------:|:----:|:----:|:----:|
| 管理大屏 | ✅ | ❌ | ❌ | ❌ |
| 门店管理 | ✅ | ❌ | ❌ | ❌ |
| 系统升级 | ✅ | ❌ | ❌ | ❌ |
| 门店总览 | ✅ | ✅ | ✅ | ❌ |
| 记账 | ✅增改删 | ✅增改删 | ✅仅新增 | ❌ |
| 盘点 | ✅ | ✅ | ✅ | ❌ |
| 开闭店 | ✅ | ✅ | ✅ | ❌ |
| 工资 | ✅ | ✅ | ❌ | ❌ |
| 分红 | ✅管理 | ❌ | ❌ | ✅只读 |
| 员工 | ✅含删除 | ✅增改 | ❌ | ❌ |
| 报表 | ✅ | ✅日/周/月 | ❌ | ✅只读 |
| 操作日志 | ✅ | ✅ | ❌ | ❌ |
| 系统备份 | ✅ | ❌ | ❌ | ❌ |
| 消息通知 | ✅ | ✅ | ✅ | ✅ |
| 个人设置 | ✅ | ✅ | ✅ | ✅ |

**数据可见性规则：**
- 管理员：看到全部记录（含系统自动生成的工资/分红支出）
- 店长/员工：只看到手动录入的记录（隐藏系统记录）
- 员工：只看今日记账，隐藏利润卡片，只能新增不能修改删除
- 报表数据包含系统记录（保证金额正确），但明细不暴露

### 安全特性
- 🔒 JWT 认证，密钥通过环境变量配置
- 🛡️ 门店级数据隔离（后端中间件校验）
- 🚫 角色权限前后端双重校验
- 📷 所有图片上传自动压缩（800px/0.6质量）+ 仅限图片文件验证
- 🔐 路径遍历防护、代码注入防护
- 📋 操作日志记录 IP 地址

### 技术特性
- 📱 PWA支持，可安装到手机桌面
- 🖥️ 桌面端+移动端自适应布局
- 🔔 微信消息推送（企业微信自建应用）
- 💾 自动/手动/升级前数据备份
- 🔄 ZIP包在线升级
- 🌐 全中文界面
- 🎨 全局 Toast 通知（替代原生 alert）
- 📸 所有图片上传支持拍照+文件，自动压缩

## 快速开始

### 环境要求
- Node.js 18+
- pnpm (推荐) 或 npm

### 安装

```bash
git clone https://github.com/MingTu01/multi-store-manager.git
cd multi-store-manager

# 安装依赖
cd apps/web && npm install --legacy-peer-deps && cd ../..
cd apps/server && npm install && cd ../..

# 构建前端
cd apps/web && npx vite build && cd ../..

# 启动服务
cd apps/server
node --import tsx src/index.ts
```

访问 http://localhost:3001

### 测试账号
| 账号 | 密码 | 角色 |
|------|------|------|
| admin | 123456 | 管理员 |
| 13900000001 | 123456 | 店长 |
| 13900000002 | 123456 | 员工 |

### 环境变量
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| JWT_SECRET | multi-store-secret-key-2024 | JWT密钥，**必须**修改 |
| TOKEN_EXPIRY | 24h | Token有效期 |
| CORS_ORIGIN | * | CORS允许的来源域名 |
| JSON_LIMIT | 30mb | JSON请求体大小限制 |
| PORT | 3001 | 服务端口 |

## 部署指南（阿里云 + 1Panel）

### 1. 服务器准备
```bash
# 购买阿里云ECS（推荐2核4G）
# 安装1Panel面板
curl -sSL https://resource.fit2cloud.com/1panel/v2/install.sh -o install.sh && bash install.sh
```

### 2. 安装Node.js环境
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm
```

### 3. 部署应用
```bash
cd /opt/multi-store-manager
cd apps/web && pnpm install && npx vite build && cd ../..
cd apps/server && pnpm install && cd ../..

# 设置环境变量
export JWT_SECRET="你的随机密钥"
export CORS_ORIGIN="https://你的域名"

# 使用 PM2 启动
cd apps/server
pm2 start "node --import tsx src/index.ts" --name multi-store
pm2 save
pm2 startup
```

### 4. 配置Nginx反向代理（1Panel中操作）
- 域名：你的域名
- 反向代理：http://127.0.0.1:3001
- 启用HTTPS（Let's Encrypt）

## 项目结构

```
multi-store-manager/
├── apps/
│   ├── server/                # Express后端
│   │   ├── src/
│   │   │   ├── index.ts       # 入口文件
│   │   │   ├── auth.ts        # JWT认证
│   │   │   ├── db.ts          # 数据库初始化+索引
│   │   │   ├── oplog.ts       # 操作日志（含IP）
│   │   │   ├── notify.ts      # 消息推送
│   │   │   ├── lib/utils.ts   # 公共工具函数
│   │   │   ├── middleware/
│   │   │   │   └── store-access.ts  # 门店权限+路径安全
│   │   │   └── routes/        # API路由
│   │   ├── data/              # SQLite数据库
│   │   └── public/            # 静态资源
│   └── web/                   # React前端
│       └── src/
│           ├── components/    # 通用组件（Toast/Modal等）
│           ├── layouts/       # 布局组件
│           ├── lib/           # 工具（api/permissions/image）
│           ├── stores/        # 状态管理
│           └── pages/         # 页面组件
├── README.md
├── ARCHITECTURE.md
└── CONTRIBUTING.md
```

## License

MIT