# Multi Shop Link

多店管理系统 — 适用于多门店经营的综合管理平台，支持桌面端和移动端 PWA，iOS 原生 UI 风格。

**当前版本：v1.1.73**

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Express 5 + TypeScript + SQLite (WAL) |
| 前端 | Vite 8 + React 19 + TypeScript + Tailwind CSS 4 |
| PWA | vite-plugin-pwa（Service Worker + manifest） |
| OCR | 阿里云 OCR（在线识别） |
| 拖动排序 | @dnd-kit |
| 图表 | Recharts |
| 端口 | 3001（可通过 PORT 环境变量修改） |
| 启动 | cd apps/server && node --import tsx src/index.ts |
| 构建 | cd apps/web && npx vite build |

## 项目仓库

| 仓库 | 用途 | 地址 |
|------|------|------|
| 源码仓库 | 开发、测试 | https://github.com/MingTu01/multi-store-manager |
| 部署仓库 | 自动构建的可运行成品 | https://github.com/MingTu01/multi-shop-link-deploy |

## 功能模块

### 管理端
- **仪表盘** — 收入/支出/利润/毛利率，趋势图，门店概览，支持日/周/月/年/总切换
- **门店管理** — 创建/编辑/删除门店，股东信息，门店状态
- **消息通知** — 站内通知 + 外部推送（PushPlus / Server酱 / 企业微信）
- **系统设置** — 系统信息、数据备份（自动/手动/上传）、系统升级（在线/ZIP）、消息推送配置、权限说明

### 门店端
- **门店总览** — 收支概览，最近记账，快捷操作
- **记账** — 收入/支出记录，分类管理
- **盘点** — 库存管理，盘点记录，差异标记
- **开闭店** — 拍照交接，开店/闭店流程
- **报表** — 收支构成，同比环比，趋势图
- **工资** — 生成/确认/归档工资单
- **分红** — 创建/确认/归档分红
- **员工** — 员工管理，头像上传，OCR 健康证识别
- **日志** — 操作日志记录
- **设置** — 分类管理，消息推送配置
- **我的** — 账户信息，修改密码

## 角色权限

| 角色 | 说明 |
|------|------|
| 系统管理员 (ADMIN) | 全部权限 |
| 店铺管理员 (STORE_ADMIN) | 单店铺管理权限 |
| 店长 (MANAGER) | 门店日常运营 |
| 员工 (STAFF) | 基础操作 |
| 股东 (SHAREHOLDER) | 只读查看 |

## 版本兼容性

- **最大跳跃版本数**：5 个次版本
- **兼容性检查**：在线更新时自动检测版本跨度
- **升级路径建议**：跨度太大时自动生成建议的中间版本

详见 [UPGRADE.md](UPGRADE.md)

## 快速开始

`ash
# 克隆源码
git clone https://github.com/MingTu01/multi-store-manager.git
cd multi-store-manager

# 安装依赖
cd apps/server && npm install
cd ../web && npm install

# 构建前端
cd ../web && npx vite build

# 启动服务
cd ../server && node --import tsx src/index.ts
`

默认管理员账号：dmin / 123456

## Docker 部署

`ash
# 克隆部署仓库
git clone https://github.com/MingTu01/multi-shop-link-deploy.git
cd multi-shop-link-deploy

# 启动容器
docker-compose up -d
`

## 更新日志

### v1.1.73
- 新增版本兼容性检查功能
- 在线更新时自动检测版本跨度
- 跨度太大时显示警告和建议升级路径
- 修复 version.json 编码问题

### v1.1.70
- 安全修复：防止通过员工 API 修改管理员密码
- 添加密码修改审计日志

### v1.1.65
- PWA 开屏页面优化
- 数据恢复功能修复
- 移动端滑动手势支持