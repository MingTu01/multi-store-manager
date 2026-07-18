# 通用项目工程模板

> 基于「多店管理系统」实战沉淀，适用于需要安全落地、可升级、多租户/多店铺隔离的中小型管理系统。

---

## 一、技术栈速查

| 层 | 选型 | 说明 |
|---|---|---|
| 后端 | Express + TypeScript (tsx 运行时) | 无需编译，直接运行 |
| 前端 | Vite + React + TypeScript | 懒加载 + Suspense |
| 数据库 | SQLite (better-sqlite3) | WAL 模式，单文件部署 |
| 容器 | Docker + docker-compose | 单一容器，volume 持久化 |
| 构建 | Node.js 脚本（非 PowerShell） | 避免编码/BOM 问题 |

---

## 二、UI 方案

### 2.1 设计语言

- **玻璃拟态（Glassmorphism）**：`backdrop-blur` + `bg-white/80` + 半透明渐变背景
- **配色**：Indigo 主色 + Slate 灰阶，Tailwind CSS
- **组件**：GlassCard、Modal、Toast 统一封装

### 2.2 前端路由架构

```
/                          → 仪表盘 (ADMIN/MANAGER+)
/login                     → 登录页（公开）
/stores                    → 店铺列表
/store/:storeId            → 店铺详情（StoreGuard 包裹）
/store/:storeId/entries    → 记账
/store/:storeId/inventory  → 盘点
/store/:storeId/staff      → 员工管理
/store/:storeId/report     → 报表
/store/:storeId/settings   → 店铺设置
...
/upgrade                   → 系统升级 (仅 ADMIN)
/admin-settings            → 全局设置 (仅 ADMIN)
```

### 2.3 权限路由模式

```tsx
// Guard 组件：统一处理 加载态 → 未登录 → 无权限 → 渲染
function Guard({ perm, children }: { perm: string; children: ReactNode }) {
  const user = useStore((s) => s.user);
  const loading = useStore((s) => s.loading);
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccess(perm, user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// 使用
<Route path="stores" element={<Guard perm="stores"><StoresPage /></Guard>} />
```

### 2.4 权限映射表

```ts
// 前端权限表（前端 + 后端双重校验）
const permissions: Record<string, Role[]> = {
  dashboard:     ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  stores:        ['ADMIN', 'STORE_ADMIN', 'MANAGER', 'STAFF', 'SHAREHOLDER'],
  upgrade:       ['ADMIN'],
  adminSettings: ['ADMIN'],
  storeStaff:    ['ADMIN', 'STORE_ADMIN', 'MANAGER'],
  storeDividends:['ADMIN', 'STORE_ADMIN', 'SHAREHOLDER'],
  // ...
};
```

### 2.5 懒加载模式

```tsx
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
// 外层 Suspense + Loading 骨架
<Suspense fallback={<Loading />}>
  <Routes>...</Routes>
</Suspense>
```

### 2.6 升级后自动刷新

```tsx
// 监听 server-ready 事件 → 清理 Service Worker 缓存 → 强制刷新
useEffect(() => {
  const handler = () => {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      clearSWCachesAndReload(); // 清 caches + 注销旧 SW + 注册新 SW + location.replace
    }, 3000);
  };
  window.addEventListener('server-ready', handler);
  return () => window.removeEventListener('server-ready', handler);
}, []);
```

---

## 三、安全方案

### 3.1 认证链路

```
┌──────────┐    登录 POST /api/auth/login     ┌──────────┐
│  前端    │ ─────────────────────────────────→ │  后端    │
│          │ ←── Set-Cookie: auth_token (HttpOnly) │          │
│          │     SameSite=Strict, maxAge=4h      │          │
└──────────┘                                     └──────────┘
       │                                               │
       │  后续请求自动携带 Cookie                         │
       │  (withCredentials: true)                       │
       ▼                                               ▼
  authMiddleware 校验：
  1. 从 Cookie 读取 auth_token（优先）
  2. 从 Authorization: Bearer 读取（兼容）
  3. jwt.verify(token, SECRET)
  4. 检查 Token 黑名单
  5. 检查 iat < updated_at（密码修改后旧 token 失效）
  6. 从 DB 补充 username/name（不存 JWT 中）
```

### 3.2 JWT Secret 管理

```ts
// 优先级：环境变量 > 文件 > 随机生成
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;  // 生产用
  const secretFile = join(dataDir, 'jwt-secret');
  if (existsSync(secretFile)) return readFileSync(secretFile, 'utf-8').trim();
  // 开发环境：自动生成 64 字节随机密钥
  const secret = crypto.randomBytes(64).toString('hex');
  writeFileSync(secretFile, secret, { mode: 0o600 });
  return secret;
}
```

### 3.3 密码修改后旧 Token 失效

```ts
// 修改密码时更新 users.updated_at
// 中间件校验：令牌签发时间必须 > 密码修改时间
if (freshUser.updated_at && decoded.iat < Math.floor(new Date(freshUser.updated_at).getTime() / 1000)) {
  return res.status(401).json({ error: '密码已修改，请重新登录' });
}
```

### 3.4 Token 黑名单

```ts
// 注销时将 token 哈希加入内存黑名单
const tokenHash = hashToken(token);
addToBlacklist(tokenHash);
// 中间件校验时检查
if (isTokenBlacklisted(tokenHash)) return res.status(401).json({ error: '令牌已注销' });
```

### 3.5 HTTP 安全头

```ts
// 必须设置的安全头
res.setHeader('X-Frame-Options', 'SAMEORIGIN');
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.removeHeader('X-Powered-By');  // 隐藏技术栈
res.setHeader('Content-Security-Policy', [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}'`,  // 随机 nonce 防 XSS
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
].join('; '));
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
```

### 3.6 CORS 配置

```ts
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);  // 同源/原生App
    if (origin.startsWith('capacitor://')) return callback(null, true);  // 原生App
    if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0) return callback(null, true);  // 未配置时允许所有（自托管兼容）
    callback(null, false);
  },
  credentials: true  // 允许携带 Cookie
};
```

### 3.7 全局速率限制

```ts
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,  // 每分钟 100 次
  keyGenerator: (req) => req.socket?.remoteAddress || 'unknown',
  skip: (req) => !req.path.startsWith('/api/') || req.path === '/api/sse'
});
```

### 3.8 路径遍历防护

```ts
// 文件下载/操作前必须校验路径
function safePath(baseDir: string, filename: string): string | null {
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return null;
  const fullPath = resolve(baseDir, filename);
  const rel = relative(baseDir, fullPath);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return fullPath;
}

// 升级清理路径白名单
function validateCleanupPath(p: string): boolean {
  if (p.includes('..')) return false;
  const normalized = p.replace(/\\/g, '/').toLowerCase();
  if (normalized.startsWith('data/') || normalized.startsWith('backups/')) return false;
  if (!normalized.startsWith('src/') && !normalized.startsWith('public/')) return false;
  return true;
}
```

### 3.9 Zip Slip 防护

```ts
function validateZipEntries(zip: AdmZip): boolean {
  for (const entry of zip.getEntries()) {
    if (entry.entryName.includes('..') || entry.entryName.includes('\x00')) return false;
  }
  return true;
}
```

### 3.10 SSRF 防护

```ts
// 推送 webhook URL 必须校验是否为内网地址
async function validateWebhookUrlAsync(url: string): Promise<{ valid: boolean; error?: string }> {
  // 禁止内网 IP、localhost、0.0.0.0 等
}
```

### 3.11 敏感数据加密存储

```ts
// 推送 Token 入库前加密，读取时解密
const encrypted = encryptToken(plaintext);
const decrypted = decryptToken(encrypted);
// 非 ADMIN 查看时脱敏：前4位 + **** + 后4位
```

---

## 四、多店铺/多租户隔离

### 4.1 数据模型

```
users.store_id → stores.id  (1:N)
entries.store_id → stores.id
inventory.store_id → stores.id
payroll.store_id → stores.id
...
```

所有业务表都带 `store_id` 字段，实现**行级数据隔离**。

### 4.2 角色体系

```
ADMIN          → 系统管理员，可访问所有店铺
STORE_ADMIN    → 店铺管理员，管理所属店铺
MANAGER        → 店长，管理所属店铺
STAFF          → 员工，只能操作所属店铺
SHAREHOLDER    → 股东，只读所属店铺
```

```ts
// 角色判断工具函数
export function isAdmin(role: string)       → role === 'ADMIN'
export function isStoreAdmin(role: string)  → ['ADMIN', 'STORE_ADMIN']
export function isManagerOrAbove(role: string) → ['ADMIN', 'STORE_ADMIN', 'MANAGER']
export function isReadonly(role: string)    → ['SHAREHOLDER']
```

### 4.3 店铺访问中间件（核心）

```ts
export function requireStoreAccess(req, res, next) {
  const storeId = req.params.storeId;
  const user = req.user;
  // 1. ADMIN 直接放行
  if (isAdmin(user.role)) return next();
  // 2. 用户所属店铺匹配
  if (user.store_id && String(user.store_id) === String(storeId)) return next();
  // 3. 股东关联检查
  const sh = db.prepare('SELECT id FROM shareholders WHERE store_id = ? AND name = ?')
    .get(storeId, user.username);
  if (sh) return next();
  // 4. 拒绝
  return res.status(403).json({ error: '无权访问该门店' });
}
```

### 4.4 路由挂载方式

```ts
// 带 storeId 的路由统一挂载中间件
app.use('/api/stores/:storeId/entries',   authMiddleware, requireStoreAccess, entriesRouter);
app.use('/api/stores/:storeId/inventory',  authMiddleware, requireStoreAccess, inventoryRouter);
app.use('/api/stores/:storeId/payrolls',   authMiddleware, requireStoreAccess, payrollRouter);
// 全局路由
app.use('/api/stores',  authMiddleware, storesRouter);   // ADMIN 可管理所有
app.use('/api/users',   authMiddleware, usersRouter);     // 带角色校验
```

### 4.5 前端店铺守卫

```tsx
// StoreGuard：进入店铺前检查 开店状态 + 权限
function StoreGuard({ children }) {
  // 1. 加载店铺信息
  // 2. 未开店 → 显示开店界面 + 上次交接内容
  // 3. 已开店 → 根据路径匹配权限 → 渲染 children
  const permMap = {
    '/entries': 'storeEntries',
    '/staff': 'storeStaff',
    '/dividends': 'storeDividends',
    // ...
  };
  if (!canAccess(permKey, user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

---

## 五、升级链路

### 5.1 整体架构

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  源码仓库     │    │  CI (GitHub Actions) │    │  部署仓库        │
│ multi-store-  │───→│  build → push     │───→│ multi-shop-link- │
│ manager       │    │  deploy repo      │    │ deploy           │
└──────────────┘    └──────────────────┘    └────────┬────────┘
                                                     │
                    ┌────────────────────────────────┤
                    ▼                                ▼
            ┌──────────────┐                ┌──────────────┐
            │  在线升级     │                │  ZIP 升级     │
            │  fetch ZIP    │                │  上传 ZIP     │
            │  from GitHub  │                │  本地安装     │
            └──────┬───────┘                └──────┬───────┘
                   └────────┬───────────────────────┘
                            ▼
                  ┌──────────────────┐
                  │  升级流程（统一）  │
                  │  1. 备份 DB       │
                  │  2. 备份代码      │
                  │  3. 解压 ZIP      │
                  │  4. cleanup.json  │
                  │  5. 原子替换文件  │
                  │  6. npm install   │
                  │  7. 同步 src-seed │
                  │  8. 重启          │
                  └──────────────────┘
```

### 5.2 升级步骤（后端实现）

```ts
// 1. 备份数据库（WAL checkpoint + ZIP）
db.pragma('wal_checkpoint(TRUNCATE)');
const preZip = new AdmZip();
preZip.addLocalFile(store.db);
preZip.writeZip('pre-upgrade-{timestamp}.zip');

// 2. 备份当前代码（用于回滚）
const codeZip = new AdmZip();
codeZip.addLocalFolder('src/', 'src');
codeZip.addLocalFolder('public/web-dist/', 'web-dist');
codeZip.addLocalFile('package.json');
codeZip.writeZip('code-backups/pre-upgrade-v{version}-{timestamp}.zip');

// 3. 解压 + 校验 ZIP
const zip = new AdmZip(zipBuffer);
if (!validateZipEntries(zip)) throw new Error('ZIP contains unsafe paths');
zip.extractAllTo(extractDir);

// 4. 处理 cleanup.json 清理清单
// { "deleteFiles": ["src/old-module.ts"], "deleteDirs": ["public/old-assets"] }

// 5. 原子替换 web-dist（备份→清空→拷贝→验证→删备份）
safeReplaceWebDist(newWebDist, destWebDist);

// 6. 原子替换 src（备份→清空→拷贝→验证→删备份）
atomicReplaceSrc(newSrc, destSrc);

// 7. npm install（失败自动回滚）
execFileSync('npm', ['install', '--omit=dev', '--ignore-scripts'], { timeout: 300000 });

// 8. 同步 src-seed 到持久化 volume
syncSrcSeed(srcDir);

// 9. 执行 post-upgrade.cjs 后置脚本

// 10. 重启
process.kill(process.pid, 'SIGTERM');
```

### 5.3 原子替换模式（template）

```ts
function atomicReplace(src: string, dest: string): void {
  const bakDir = dest + '.bak.' + Date.now();
  const tmpDir = dest + '.tmp.' + Date.now();
  try {
    // 1. 拷贝新内容到临时目录
    cpSync(src, tmpDir, { recursive: true });
    // 2. 验证关键文件存在
    if (!existsSync(join(tmpDir, 'index.ts'))) throw new Error('缺少入口文件');
    // 3. 备份旧内容
    cpSync(dest, bakDir, { recursive: true });
    // 4. 清空目标目录
    rmrfDirContents(dest);
    // 5. 拷贝新内容
    cpSync(tmpDir, dest, { recursive: true });
    // 6. 验证拷贝成功
    if (!existsSync(join(dest, 'index.ts'))) throw new Error('验证失败');
    // 7. 成功，删除备份
    rmSync(bakDir, { recursive: true });
  } catch (err) {
    // 回滚：从备份恢复
    if (existsSync(bakDir)) {
      rmrfDirContents(dest);
      cpSync(bakDir, dest, { recursive: true });
    }
    throw err;
  } finally {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    try { rmSync(bakDir, { recursive: true }); } catch {}
  }
}
```

### 5.4 src-seed 持久化同步机制

解决容器 down/up 后 src 回退到镜像旧版本的问题：

```
┌──────────────────────────────────────────────────────┐
│  Docker 镜像层（只读）                                 │
│  /app/src  ← 构建时打入，down/up 后回退到此版本        │
│  /app/web-dist-seed  ← 构建时备份                     │
├──────────────────────────────────────────────────────┤
│  Docker Volume（持久化，写操作）                        │
│  /app/data/src-seed  ← 升级时同步最新 src              │
│  /app/public/web-dist  ← volume mount                │
├──────────────────────────────────────────────────────┤
│  Entrypoint 启动逻辑：                                 │
│  1. 比较 src/index.ts 与 data/src-seed/index.ts       │
│  2. 不一致 → 从 data/src-seed 恢复 src                 │
│  3. 比较 web-dist 与 web-dist-seed → 自动同步          │
└──────────────────────────────────────────────────────┘
```

### 5.5 版本兼容性检查

```ts
// 次版本跨越不超过 5 个，超过则建议分步升级
const MAX_MINOR_JUMP = 5;
const diff = getVersionDiff(current, latest);
if (diff.totalMinor > MAX_MINOR_JUMP) {
  // 生成分步升级路径
  warning = '建议分步升级以确保数据安全';
}
```

### 5.6 升级进度推送（SSE）

```ts
// 前端通过 SSE 实时接收升级进度
const eventSource = new EventSource('/api/upgrade/stream');
eventSource.addEventListener('progress', (e) => {
  const { step, total, message } = JSON.parse(e.data);
  // 更新进度条
});
eventSource.addEventListener('complete', () => {
  // 升级完成，等待重启
});
```

### 5.7 升级失败自动回滚

```
entrypoint.js 崩溃监控：
  30 秒内崩溃 3 次 → 自动回滚
  从 backups/code-backups/ 找最近的 pre-upgrade-*.zip
  恢复 src + web-dist + package.json → npm install → 重启
```

### 5.8 升级红线规则

1. **禁止先删后复制** — 永远先拷贝到临时目录，验证后再原子替换
2. **禁止 fire-and-forget 异步** — 破坏性操作必须有同步错误反馈
3. **全局搜索同类代码** — 修一个就要搜所有
4. **BOM/CRLF 检测** — 所有 .cjs/.sh 打包前必须检测
5. **变量作用域验证** — 移动变量后确认所有引用点
6. **Docker volume 意识** — `/app/data`、`/app/uploads`、`/app/public/web-dist` 是 volume
7. **升级后必须端到端测试**

---

## 六、数据库迁移方案

### 6.1 版本化迁移

```ts
// 迁移表：追踪已执行的迁移
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT DEFAULT (datetime('now','localtime')),
  success INTEGER DEFAULT 1,
  error_msg TEXT DEFAULT ''
);

// 迁移数组
const migrations = [
  "ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''",
  // ...
];

// 执行未应用的迁移
for (const [i, sql] of migrations.entries()) {
  if (appliedVersions.has(i + 1)) continue;
  try {
    db.exec(sql);
    db.prepare('INSERT OR REPLACE INTO schema_version ...').run(i + 1, ...);
  } catch (e) {
    // 兼容 duplicate column 等不算失败
    if (e.message.includes('duplicate column')) {
      db.prepare('INSERT ... success=1, error_msg="already applied"').run(...);
    }
  }
}
```

### 6.2 强制补偿迁移

```ts
// 解决：版本化迁移标记为 success=1 但实际未执行的情况
// 独立 try-catch，每个列单独执行，忽略 duplicate column
const forceColumns = ['push_entry', 'push_payroll', 'push_dividend', /* ... */];
for (const col of forceColumns) {
  try {
    db.exec(`ALTER TABLE user_notification_settings ADD COLUMN ${col} INTEGER DEFAULT 1`);
  } catch (e) {
    if (!e.message.includes('duplicate column')) logger.warn('补偿迁移失败', col, e.message);
  }
}
```

### 6.3 历史数据补偿

```ts
// 升级后补填历史数据，避免"僵尸数据"
db.prepare("UPDATE notifications SET read_at = created_at WHERE read = 1 AND read_at IS NULL").run();
```

---

## 七、Docker 容器化部署

### 7.1 docker-compose.yml

```yaml
services:
  app:
    build: .
    container_name: my-app
    ports:
      - "3001:3001"
    volumes:
      - app-data:/app/data        # 数据库 + 版本 + src-seed（持久化）
      - ./uploads:/app/uploads    # 上传文件
      - ./backups:/app/backups    # 备份
      - ./apps/server/public/web-dist:/app/public/web-dist  # 前端（volume）
    environment:
      - NODE_ENV=production
      - PORT=3001
      - JWT_SECRET=${JWT_SECRET:?请设置JWT_SECRET}
      - CORS_ORIGIN=${CORS_ORIGIN:-}
    restart: unless-stopped
volumes:
  app-data:
```

### 7.2 Entrypoint 启动流程

```
1. 启动诊断 (startup-check.js)
2. web-dist 同步（镜像 seed vs volume）
3. src 同步（data/src-seed vs 镜像 src）
4. 检查依赖完整性（tsx, express, better-sqlite3）
5. 缺失则 npm install
6. 启动应用（spawn node --import tsx src/index.ts）
7. 崩溃监控：30s 内 3 次 → 自动回滚
```

### 7.3 崩溃自动回滚

```js
let crashCount = 0;
child.on('exit', (code) => {
  crashCount++;
  if (crashCount >= 3) {
    // 从 backups/code-backups/ 找最近的 pre-upgrade-*.zip
    // 恢复 src + web-dist + package.json
    // npm install → 重启
    attemptAutoRollback();
  } else {
    setTimeout(startApp, 2000);
  }
});
```

---

## 八、推送通知系统

### 8.1 多渠道架构

```
用户触发事件
  │
  ▼
notify-trigger.ts (triggerNotification)
  │
  ├──→ PushPlus (pushplus_token)
  ├──→ 企业微信 (wecom_corpid/agentid/secret)
  ├──→ 爱语飞飞 (iyuu_token)
  └──→ 浏览器 Web Push (VAPID) + JPush (APP)
```

### 8.2 用户级推送设置

```sql
CREATE TABLE user_notification_settings (
  user_id INTEGER PRIMARY KEY,
  method TEXT DEFAULT 'none',
  pushplus_token TEXT DEFAULT '',
  wecom_corpid TEXT DEFAULT '',
  -- 26 个推送类型开关
  push_entry INTEGER DEFAULT 1,
  push_payroll INTEGER DEFAULT 1,
  push_dividend INTEGER DEFAULT 1,
  push_inventory INTEGER DEFAULT 1,
  -- ...
);
```

### 8.3 按角色区分推送内容

- ADMIN 且 storeId 存在 → 带 `[店铺名]` 标签
- 其他角色 → 不带标签
- 用户可逐个开关推送类型

---

## 九、版本管理规范

### 9.1 版本格式

```
v主版本.次版本.修订号
例：v2.1.4

主版本：重大架构变更
次版本：新增功能
修订号：Bug 修复
```

### 9.2 版本号存储

```json
// /app/data/version.json — 单一事实来源
{ "version": "v2.1.4" }
```

### 9.3 每次修改必须做的事

1. 更新版本号
2. 构建前删除 dist
3. 验证 dist 内容
4. 用 tar 命令或 Node.js adm-zip 打包（不能用 PowerShell Compress-Archive）
5. 验证打包后的 ZIP 可正常解压

---

## 十、CI/CD 部署链路

### 10.1 双仓库模式

```
源码仓库 (multi-store-manager)
  │  git push
  ▼
GitHub Actions CI
  │  npm install → vite build → 打包
  ▼
部署仓库 (multi-shop-link-deploy)
  │  包含：src/ + public/web-dist/ + package.json
  │       + entrypoint.js + Dockerfile + docker-compose.yml
  ▼
生产服务器
  │  git pull + docker-compose up -d --build
  │  或 Web UI 在线升级
```

### 10.2 上线检查清单

```
□ 源码仓库推送成功
□ CI 成功推送到部署仓库
□ 部署仓库版本号正确
□ 生产环境 git pull 拉取到最新
□ docker-compose up -d --build 成功
□ docker logs 无异常
□ 登录验证通过
□ 核心功能端到端测试通过
```

---

## 十一、通用落地检查清单

将以上模板应用到新项目时，确认以下每一项：

### 安全

- [ ] JWT + HttpOnly Cookie（非 localStorage）
- [ ] SameSite=Strict
- [ ] 密码修改后旧 Token 失效（iat < updated_at）
- [ ] Token 黑名单
- [ ] CSP 头 + nonce
- [ ] X-Frame-Options / HSTS / X-Content-Type-Options
- [ ] CORS 白名单
- [ ] 全局速率限制
- [ ] 路径遍历防护（safePath）
- [ ] Zip Slip 防护
- [ ] SSRF 防护（webhook URL 校验）
- [ ] 敏感数据加密存储
- [ ] 移除 X-Powered-By

### 多租户隔离

- [ ] 所有业务表带 tenant_id/store_id
- [ ] 后端中间件统一校验租户归属
- [ ] 前端 StoreGuard/TenantGuard
- [ ] 角色枚举 + 权限映射表
- [ ] 前端权限 + 后端权限双重校验

### 升级链路

- [ ] 升级前备份 DB + 代码
- [ ] 原子替换（先拷贝到临时目录，验证后再替换）
- [ ] 失败自动回滚
- [ ] cleanup.json 清理清单
- [ ] post-upgrade.cjs 后置脚本
- [ ] SSE 进度推送
- [ ] src-seed 持久化同步
- [ ] 版本兼容性检查
- [ ] 崩溃自动回滚（entrypoint 监控）

### 数据库

- [ ] 版本化迁移表（schema_version）
- [ ] 强制补偿迁移（独立 try-catch）
- [ ] 历史数据补偿
- [ ] 性能索引

### 容器化

- [ ] 数据目录 volume 持久化
- [ ] JWT_SECRET 环境变量
- [ ] 健康检查
- [ ] 优雅关闭（SIGTERM 处理）
- [ ] 未捕获异常保护

### 前端

- [ ] 懒加载 + Suspense
- [ ] Guard 组件统一权限控制
- [ ] 升级后自动清理 SW 缓存
- [ ] 错误边界（ErrorBoundary）

---

> 模板版本：v1.0.0 | 基于多店管理系统 v2.1.4 实战沉淀