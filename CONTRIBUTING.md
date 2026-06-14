# 开发贡献指南

## 环境准备

### 必需
- Node.js 20+
- pnpm 8+ (推荐) 或 npm
- Git

### 可选
- VSCode + ESLint/Prettier 插件
- 1Panel (部署用)

### 安装依赖
```bash
git clone https://github.com/MingTu01/multi-store-manager.git
cd multi-store-manager
pnpm install
```

### 启动开发
```bash
# 终端1: 后端
cd apps/server
node --import tsx src/index.ts

# 终端2: 前端 (可选, 用Vite dev server)
cd apps/web
npx vite
```

## 项目结构速查

| 文件 | 作用 | 可修改性 |
|------|------|---------|
| `apps/server/src/db.ts` | 数据库表结构+迁移 | 谨慎：只能追加迁移，不能改已有表结构 |
| `apps/server/src/auth.ts` | JWT认证 | 谨慎：改动影响全站登录 |
| `apps/server/src/routes/*.ts` | API路由 | 安全：按模块独立 |
| `apps/web/src/App.tsx` | 路由配置 | 谨慎：改动影响页面导航 |
| `apps/web/src/lib/permissions.ts` | 权限控制 | 谨慎：改动影响角色权限 |
| `apps/web/src/pages/**/*.tsx` | 页面组件 | 安全：按页面独立 |
| `apps/web/src/components/*.tsx` | 通用组件 | 安全：被多处引用时注意兼容 |

## 编码规范

### 通用
- **编码**: UTF-8 无BOM
- **语言**: 所有UI文本使用中文
- **中文字符串**: 在JSX/TSX中优先使用Unicode转义避免编码问题
  ```typescript
  // 推荐
  var yen = String.fromCharCode(165); // ¥
  String.fromCharCode(20170,22825); // 今天
  
  // 可以直接用（但注意文件编码必须UTF-8无BOM）
  '收入'
  ```

### 后端
- 路由使用 `Router({ mergeParams: true })` 以访问父路由参数
- 认证中间件：`authMiddleware`
- 操作日志：`opLog(userId, storeId, action, detail)`
- 修改类日志使用JSON格式：
  ```typescript
  opLog(userId, storeId, '记账', JSON.stringify({
    action: 'modify', id: entryId,
    before: { type, category, amount, note, date },
    after: { type, category, amount, note, date }
  }));
  ```
- 不要使用PowerShell脚本或.bat脚本（系统部署到Linux）
- 服务器重启使用独立进程方式，不要用 `process.exit()`

### 前端
- 页面放在 `apps/web/src/pages/{模块}/`
- 使用现有组件：GlassCard、Modal、PageHeader、PeriodTabs、FloatingActionButton
- 金额显示使用 `MoneyDisplay` 组件
- 移动端适配使用Tailwind的响应式前缀（`sm:`、`lg:`）
- 弹窗使用 `Modal` 组件，不要自己写overlay

### 数据库
- 新增表：在 `db.ts` 的 `CREATE TABLE` 区域添加
- 新增字段：在 `migrations` 数组中添加 `ALTER TABLE` 语句
- **不要修改已有表结构**，只能追加
- WAL模式：备份时需要 `PRAGMA wal_checkpoint(FULL)`

## Git 规范

### 分支
- `main` - 生产分支
- `codex/*` - Codex自动创建的开发分支

### 提交信息格式
```
<type>: <description>

# 类型
feat:     新功能
fix:      修复
chore:    杂项（清理、配置）
docs:     文档
refactor: 重构
```

### 版本管理
- 版本号记录在 `apps/server/data/version.json`
- 使用语义化版本：`v{major}.{minor}.{patch}`
- 每次修改都要更新版本号
- Git标签：`git tag v0.5.0`

## 测试账号

| 账号 | 密码 | 角色 | 门店 |
|------|------|------|------|
| admin | 123456 | ADMIN | 全部 |
| 13900000001 | 123456 | MANAGER | 城南旗舰店(s1) |
| 13900000002 | 123456 | STAFF | 城南旗舰店(s1) |
| 13900000004 | 123456 | MANAGER | 万达体验店(s2) |
| 13900000006 | 123456 | MANAGER | 大学城店(s3) |

## 构建部署

### 构建前端
```bash
cd apps/web
# 必须先删除dist
rm -rf dist
npx vite build
# 验证dist内容
ls dist/
```

### 打包ZIP升级包
```bash
# 确保dist已构建
cd apps/web && npx vite build && cd ../..

# 创建升级包
mkdir -p dist-upgrade/apps
cp -r apps/server dist-upgrade/apps/
cp -r apps/web dist-upgrade/apps/
echo '{"version":"X.X.X","description":"描述"}' > dist-upgrade/upgrade.json
cp package.json dist-upgrade/
cd dist-upgrade && zip -r ../multi-store-upgrade-vX.X.X.zip . && cd ..
```

### PM2管理
```bash
pm2 start "node --import tsx src/index.ts" --name multi-store -w apps/server
pm2 logs multi-store    # 查看日志
pm2 restart multi-store # 重启
pm2 stop multi-store    # 停止
```

## 常见问题

### Q: 构建后白屏？
A: 检查浏览器控制台错误。常见原因：
1. 中文字符串编码问题 → 使用 `String.fromCharCode()`
2. 变量未定义 → 检查import和声明
3. 正则表达式语法错误 → 用 `new RegExp()` 代替字面量

### Q: 数据库锁定？
A: SQLite WAL模式下正常不会锁定。如果出现：
```bash
# 检查WAL文件
ls -la apps/server/data/
# 重启服务释放锁
pm2 restart multi-store
```

### Q: 图片上传失败？
A: 检查：
1. 文件大小限制（默认10MB）
2. 图片会自动压缩到合理大小
3. 存储路径 `apps/server/public/uploads/`

### Q: 如何重置数据库？
A: 删除数据库文件重启服务：
```bash
rm apps/server/data/store.db*
pm2 restart multi-store
# 重启后会自动创建新数据库并填充种子数据
```

## 注意事项

1. **不要修改 `db.ts` 中已有的 CREATE TABLE 语句**，只能追加迁移
2. **不要在路由文件中使用 PowerShell 或 bat 脚本**
3. **修改代码后必须更新 `apps/server/data/version.json` 版本号**
4. **构建前必须删除 `dist` 目录**
5. **所有文件使用 UTF-8 无BOM 编码**