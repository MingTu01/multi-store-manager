# Multi Shop Link

多店管理系统 — 适用于多门店经营的综合管理平台，支持桌面端和移动端 PWA，iOS 原生 UI 风格。

**当前版本：v1.2.26**
## 更新日志


### v1.2.6 (2026-06-22)
- **安全加固：httpOnly Cookie 认证** — 移除 localStorage JWT 存储，改用 httpOnly + Secure + SameSite=Lax Cookie
- **后端 Cookie 工具** — 新增 getCookie/setAuthCookie/clearAuthCookie，不引入 cookie-parser 依赖
- **向后兼容** — authMiddleware 优先读 Cookie → Authorization header → query token
- **登出端点** — POST /api/auth/logout 清除 cookie
- **CSP nonce** — 每请求生成随机 nonce（保留 unsafe-inline fallback）
- **Token 过期缩短** — 24h → 4h
- **CORS 收紧** — 默认只允许生产域名 msl.908521.xyz
- **SW 敏感 API** — payroll/dividends/staff 路由不缓存
- **execSync → execFileSync** — 防止命令注入
- **ZIP SHA256 校验** — 升级包完整性验证
- **SQL 参数化** — notifications 路由消除字符串拼接
- **文件删除权限** — upload 路由增加角色+门店归属校验

### v1.2.5 (2026-06-22)
- **在线升级修复** — broadcastProgress 正确更新 upgradeState，轮询带认证信息，重启检测修复
- **升级进度细化** — 在线升级和 ZIP 升级均显示实时子步骤

### v1.2.4 (2026-06-22)
- **PWA 自动更新** — 添加 skipWaiting + clientsClaim，解决更新后页面不刷新的问题
- **底部导航优化** — MAX_DIRECT 5→6，通知移到直接导航栏

### v1.2.3 (2026-06-22)
- **图表优化** — YAxis 保留数字标签，去掉轴线和刻度线，减少左边空地
- **图表全屏展示** — 所有图表支持双击全屏，移动端强制横屏，桌面端居中弹窗
- **趋势图筛选** — 仪表盘/报表/进货页面支持 7/14/30/60 天筛选
- **图片预览增强** — 全页面图片支持点击放大、滚动缩放、双击重置，解决被遮挡问题
- **底部导航优化** — MAX_DIRECT 5→6，通知移到直接导航栏，显示未读角标
- **开闭店页面优化** — 展开/收起状态保持，图片点击不再触发收起
- **进货单功能** — 表单模式、趋势分析、建议订货量、导出图片
- **阿里云 OCR** — 替换 Tesseract.js，使用通用票证抽取 API

### v1.2.2 (2026-06-22)
- **SSE 单例化** — 全应用只维护一个 SSE 连接，解决快速切换页面导致连接累积、服务器卡死的问题
- **服务端连接限制** — 每用户限 1 个 SSE 连接，新连接自动关闭旧连接
- **登录切换修复** — 退出登录时断开 SSE 并清理缓存，登录时重连；API 缓存按 token 隔离
- **restore() 超时保护** — 5 秒超时 + 安全兜底，防止 ServiceWorker 缓存导致页面卡死
- **ServiceWorker 优化** — auth 端点排除缓存，避免旧 token 响应干扰
- **手机号即登录名** — 非 ADMIN 角色修改手机号时自动同步登录名
- **手机号验证** — 所有手机号输入强制 11 位格式校验
- **股东权限** — SHAREHOLDER 可访问进货页面（只读）
- **STAFF 权限修复** — 员工可正常新增/修改/删除记账
- **底部导航优化** — 统一角色权限排序，≤5 项直接显示，>5 项显示"更多"
- **开闭店路由修复** — last-close-handover 路由顺序修正，解决 404
- **PWA meta 标签** — 添加 mobile-web-app-capable 兼容新浏览器


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
- **进货** — 每日进货登记，上午/下午数量填写，趋势分析图表，星期均值参考，建议订货量
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

```bash
# 克隆部署仓库
git clone https://github.com/MingTu01/multi-shop-link-deploy.git
cd multi-shop-link-deploy

# 复制环境变量模板（生产环境必须配置）
cp .env.example .env
# 编辑 .env 填入你的域名和密钥

docker-compose up -d
```

### 环境变量

在项目根目录创建 `.env` 文件：

| 变量 | 必填 | 说明 | 示例 |
|------|------|------|------|
| `JWT_SECRET` | 是 | JWT 认证密钥，任意随机字符串 | `your-random-secret-key` |
| `CORS_ORIGIN` | 生产必填 | 允许的前端域名，含协议，多个逗号分隔 | `https://your-domain.com` |
| `PORT` | 否 | 服务端口，默认 3001 | `3001` |

**CORS_ORIGIN 说明：**
- 不设置时允许所有来源（仅限本地开发）
- **生产环境必须设置**，否则通过域名访问时会被 CORS 拦截，导致登录、升级等功能失败
- 如果同时通过域名和 IP 访问，用逗号分隔：`https://your-domain.com,http://server-ip:3001`


## 更新日志

### v1.1.83
- 新增进货登记功能：每日进货表单、趋势分析图表、星期均值参考、建议订货量
- 修复趋势数据硬编码7天问题，按请求天数动态返回
- 修复星期均值截断只显示8个商品
- 修复图例筛选不起作用
- 建议订货量使用固定60天窗口，不随趋势切换变化
- 修复SettingsPage TypeScript类型错误

### v1.1.82
- 消息通知筛选功能修复
- 前端通知列表按类型过滤

### v1.1.81
- 进货登记功能初版（测试中）

### v1.1.80
- 验证在线升级流程完整性

### v1.1.79
- CORS 修复：未配置 CORS_ORIGIN 时默认允许所有来源（自托管兼容）
- 修复在线升级进度弹窗提前显示"升级完成"的问题
- 前端延迟 5 秒再轮询服务器重启状态

### v1.1.78
- 修复时间显示 UTC 偏移 8 小时的问题
- 修复在线升级不生效的致命 bug
- 修复升级链路三个致命 bug（workDir TDZ 错误、clearDir 破坏 volume mount、post-upgrade BOM）
- 修复 CI 覆盖 Dockerfile/entrypoint.sh 的问题
- 升级包打包添加 BOM 自动检测

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