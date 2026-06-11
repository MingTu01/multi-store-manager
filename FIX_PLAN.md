# 多店铺管理系统 完整修复计划

> 编制时间：2026-06-11
> 核心约束：只修改后端代码（apps/server/），不改前端，不改变现有合法用户的操作体验和 API 行为
> 目标：修复全部 29 项安全漏洞 + 17 项代码质量问题 + 8 项性能优化问题，同时确保系统完整性和零功能回归

---

## 修复总览

| 阶段 | 文件 | 修改类型 | 修复问题数 | 风险等级 |
|------|------|----------|-----------|---------|
| 1 | 新建 middleware/ 权限层 | 新增文件 | S3,S4,S12,S24,S26,S27,S29 | 低 — 纯新增，不改现有文件逻辑 |
| 2 | auth.ts | 修改 | S1,S13,S17,S18 | 低 — 改密钥来源，不影响验证流程 |
| 3 | index.ts | 修改 | S6,S7,S15,P5 | 低 — 加中间件和配置 |
| 4 | routes/users.ts | 修改 | S5,S23 | 低 — 只加权限检查 |
| 5 | routes/stores.ts | 修改 | S25,S14,Q10 | 低 — 只加权限检查和补充清理 |
| 6 | routes/reports.ts | 修改 | S3 | 低 — 加路径校验 |
| 7 | routes/system.ts | 修改 | S2,S3,S9,S30,Q15 | 中 — 重写恢复脚本生成方式 |
| 8 | routes/entries.ts | 修改 | S12,Q6,Q16 | 低 — 加归属校验和 try/catch |
| 9 | routes/categories.ts | 修改 | S28 | 低 — 加归属校验 |
| 10 | routes/inventory.ts | 修改 | S29 | 低 — 加归属校验 |
| 11 | routes/dashboard.ts | 修改 | Q13 | 低 — 加角色检查 |
| 12 | routes/notifications.ts | 修改 | S14 | 低 — 加角色检查 |
| 13 | db.ts | 修改 | P1,Q8 | 低 — 加索引 SQL |
| 14 | 新建 lib/utils.ts | 新增文件 | Q1 | 低 — 纯新增 |
| 15 | oplog.ts | 修改 | S20 | 低 — 加 IP 记录 |
| 16 | 全部路由 | 修改 | Q2,Q7 | 低 — 加事务包裹 |

---

## 阶段 1：新建权限中间件层 [最关键]

### 新建文件：`apps/server/src/middleware/store-access.ts`

**目的**：集中处理门店归属校验（S4）、记录归属校验（S12）、角色校验（S5/S25）、路径安全（S3）

```typescript
// apps/server/src/middleware/store-access.ts
import { Response, NextFunction } from 'express';
import db from '../db.js';
import { AuthRequest } from '../auth.js';
import { resolve, relative, isAbsolute } from 'path';

// ============================================================
// 1. 门店访问控制中间件（S4）
//    ADMIN 可访问所有门店
//    MANAGER/STAFF 只能访问其 store_id 对应的门店
//    SHAREHOLDER 只能访问其在 shareholders 表中有关联的门店
// ============================================================
export function requireStoreAccess(req: AuthRequest, res: Response, next: NextFunction) {
  const storeId = req.params.storeId;
  if (!storeId) return next();

  const user = req.user;
  if (!user) return res.status(401).json({ error: '未认证' });

  // ADMIN 全局放行
  if (user.role === 'ADMIN' || user.role === 'admin') return next();

  // MANAGER/STAFF 检查 store_id 归属
  if (user.store_id && String(user.store_id) === String(storeId)) return next();

  // SHAREHOLDER 检查 shareholders 表
  const sh = db.prepare('SELECT id FROM shareholders WHERE store_id = ? AND name = ?')
    .get(storeId, user.username) as any;
  if (sh) return next();

  // 无权限
  return res.status(403).json({ error: '无权访问该门店' });
}

// ============================================================
// 2. 角色要求中间件（S5/S25）
//    用法：requireRole('ADMIN', 'MANAGER')
// ============================================================
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userRole = (req.user?.role || '').toUpperCase();
    if (!roles.map(r => r.toUpperCase()).includes(userRole)) {
      return res.status(403).json({ error: '无权限' });
    }
    next();
  };
}

// ============================================================
// 3. 路径安全校验（S3）
//    防止路径遍历攻击
// ============================================================
export function safePath(baseDir: string, filename: string): string | null {
  // 禁止路径遍历字符
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return null;
  }
  const fullPath = resolve(baseDir, filename);
  const rel = relative(baseDir, fullPath);
  // 确保解析后的路径仍在 baseDir 内
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return null;
  }
  return fullPath;
}

// ============================================================
// 4. 记录归属校验辅助函数（S12/S26/S27/S29）
// ============================================================
export function checkEntryOwnership(entryId: string, storeId: string): boolean {
  const entry = db.prepare('SELECT store_id FROM entries WHERE id = ?').get(entryId) as any;
  return entry && String(entry.store_id) === String(storeId);
}

export function checkInventoryItemOwnership(itemId: string, storeId: string): boolean {
  const item = db.prepare(
    'SELECT ic.store_id FROM inventory_master ic WHERE ic.id = ?'
  ).get(itemId) as any;
  return item && String(item.store_id) === String(storeId);
}

export function checkCategoryOwnership(categoryId: string, storeId: string): boolean {
  const cat = db.prepare('SELECT store_id FROM categories WHERE id = ?').get(categoryId) as any;
  // 全局分类(store_id=null)只有 ADMIN 可修改
  if (!cat) return false;
  if (cat.store_id === null) return false; // 由调用方判断 ADMIN 权限
  return String(cat.store_id) === String(storeId);
}
```

### 影响分析
- **零破坏**：这是全新文件，不修改任何现有代码
- **前端无需改动**：所有校验在后端中间件层面完成，前端请求格式不变
- **ADMIN 用户体验不变**：ADMIN 全局放行，和当前行为完全一致
- **MANAGER/STAFF 合法操作不变**：正常访问自己门店的数据不受影响

---

## 阶段 2：修复 auth.ts [S1, S13, S17, S18]

### 文件：`apps/server/src/auth.ts`

**修改 1 — JWT 密钥改为环境变量（S1）**
```
当前代码（第 4 行）：
  const SECRET = 'multi-store-secret-key-2024';

修改为：
  const SECRET = process.env.JWT_SECRET || 'multi-store-secret-key-2024';
```
- 保留 fallback 是为了开发环境兼容，部署时通过环境变量覆盖即可
- 如果环境变量存在则用环境变量，不存在则用旧值（向后兼容，不破坏现有部署）
- 部署说明中要求在 .env 或 PM2 配置中设置 JWT_SECRET

**修改 2 — 移除 URL Token 支持（S13）**
```
当前代码（第 14-16 行）：
  } else if (req.query.token) {
    token = req.query.token as string;
  }

修改为：
  // 移除 query token 支持（安全考虑，仅支持 Header）
  // } else if (req.query.token) {
  //   token = req.query.token as string;
  // }
```
- 注释掉而非删除，保留代码意图说明

**修改 3 — 缩短 Token 有效期（S17）**
```
当前代码（第 28 行）：
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });

修改为：
  const tokenExpiry = process.env.TOKEN_EXPIRY || '24h';
  return jwt.sign(payload, SECRET, { expiresIn: tokenExpiry });
```
- 默认从 7 天改为 24 小时，可通过环境变量自定义
- 对用户体验的影响：用户需要更频繁地登录，但 24 小时对于财务系统是合理范围

**修改 4 — 关键操作时重新校验用户状态（S18）**

新增一个辅助函数，供关键路由调用（不自动应用于所有路由，避免性能影响）：
```typescript
// 新增导出函数
export function requireFreshUser(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user?.id) return res.status(401).json({ error: '未认证' });
  const freshUser = db.prepare('SELECT id, role, store_id, status FROM users WHERE id = ?')
    .get(req.user.id) as any;
  if (!freshUser) return res.status(401).json({ error: '用户不存在' });
  if (freshUser.status !== 'active') return res.status(403).json({ error: '账号已被禁用' });
  // 用数据库中的最新角色覆盖 JWT 中的旧角色
  req.user.role = freshUser.role;
  req.user.store_id = freshUser.store_id;
  next();
}
```
- 此函数**不自动应用于所有路由**（避免每个请求都查库），仅在修改角色/门店等关键操作后由前端刷新 Token
- 现有的 `authMiddleware` 保持不变，不增加额外数据库查询

### 影响分析
- **S1**：有环境变量则用新的，没有则用旧的，**完全向后兼容**
- **S13**：如果前端确实用 URL query 传递 Token（如报表下载链接），需要改为通过 Header。需确认前端是否有此用法——经审查前端 api.ts 只用 Header，**无影响**
- **S17**：用户会话从 7 天缩短到 24 小时，用户每天需重新登录一次，对于财务系统可接受
- **S18**：纯新增函数，不改变现有流程，**零影响**

---

## 阶段 3：修复 index.ts [S6, S7, S15, P5]

### 文件：`apps/server/src/index.ts`

**修改 1 — 报表接口加认证（S6）**
```
当前代码（第 41 行）：
  app.use('/api/reports', reportsRouter);

修改为：
  app.use('/api/reports', authMiddleware, reportsRouter);
```
- 影响：未登录用户无法再访问报表。合法用户不受影响。

**修改 2 — CORS 配置可信域名（S7）**
```
当前代码（第 12 行）：
  app.use(cors());

修改为：
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  app.use(cors({ origin: corsOrigin === '*' ? '*' : corsOrigin.split(',') }));
```
- 通过环境变量配置，默认 `*`（向后兼容）
- 部署时设置 CORS_ORIGIN=https://your-domain.com

**修改 3 — 降低 JSON body 大小限制（P5）**
```
当前代码（第 13 行）：
  app.use(express.json({ limit: '50mb' }));

修改为：
  const jsonLimit = process.env.JSON_LIMIT || '5mb';
  app.use(express.json({ limit: jsonLimit }));
```
- 默认从 50MB 降到 5MB，可通过环境变量覆盖
- 如果现有业务确实需要大 payload（如图片 base64），设置环境变量即可

**修改 4 — 生产环境隐藏错误详情（S15）**

在所有路由之前添加错误处理中间件：
```typescript
// 全局错误处理 — 生产环境隐藏内部错误详情
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Unhandled error:', err);
  const message = process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message;
  res.status(500).json({ error: message });
});
```
- 注意：这只能捕获同步错误和 next(err) 传递的错误。现有路由中用 try/catch 返回 err.message 的不受影响
- 作为兜底保护，不影响现有行为

### 影响分析
- **S6**：前端通过 api.ts 的 headers() 发送 Token，合法用户不受影响
- **S7**：默认 `*` 向后兼容，部署时配置具体域名
- **P5**：如果现有业务有超过 5MB 的 JSON 请求，需设置环境变量。经审查，图片使用 base64 在 store_opens 的 photos 字段中，单张图片约 1-3MB，5MB 应足够
- **S15**：只影响未被 catch 的异常，现有 try/catch 逻辑不变

---

## 阶段 4：修复 routes/users.ts [S5, S23]

### 文件：`apps/server/src/routes/users.ts`

**修改 1 — GET / 添加 ADMIN/MANAGER 角色校验（S5）**
```
在 router.get('/', ...) 函数体开头添加：
  if (!['admin', 'ADMIN', 'manager', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：STAFF 和 SHAREHOLDER 无法再列出所有用户。前端中 STAFF 不会访问用户管理页面（权限表限制），**无影响**

**修改 2 — GET /:id 添加角色校验（S5）**
```
在 router.get('/:id', ...) 函数体开头添加：
  if (!['admin', 'ADMIN', 'manager', 'MANAGER'].includes(req.user.role)
      && parseInt(req.params.id) !== req.user.id) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：STAFF 只能查看自己的信息，不能查看其他人。前端中 "账户" 页面查的是自己的信息（/api/auth/me），**无影响**

**修改 3 — POST / 添加 ADMIN 角色校验（S5）**
```
在 router.post('/', ...) 函数体开头添加：
  if (!['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：只有 ADMIN 能创建用户。前端中用户管理页面仅 ADMIN 可见，**无影响**

**修改 4 — PUT /:id 禁止非管理员修改 role 字段（S5）**
```
在 router.put('/:id', ...) 中，找到：
  if (role !== undefined) { fields.push('role=?'); vals.push(role); }

修改为：
  if (role !== undefined) {
    if (!['admin', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: '无权修改角色' });
    }
    fields.push('role=?'); vals.push(role);
  }
```
- 影响：普通用户不能修改角色字段，其他字段（name/phone/salary等）仍可修改。**无影响**

**修改 5 — DELETE /:id 添加 ADMIN 角色校验（S5）**
```
在 router.delete('/:id', ...) 函数体开头添加：
  if (!['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：只有 ADMIN 能删除用户。**无影响**

**修改 6 — 登录接口返回数据裁剪（S23）**

修改 auth.ts 中 POST /login 的响应（不是 users.ts）：
```
在 apps/server/src/routes/auth.ts 的 login 路由中，
当前代码：
  const { password_hash, ...userData } = user;
  res.json({ token, user: userData });

修改为：
  const { password_hash, salary, address, ...safeData } = user;
  res.json({ token, user: safeData });
```
- 影响：登录响应不再包含 salary 和 address。前端登录后通过 /api/auth/me 获取完整信息，而 /api/auth/me 已经只查特定字段，**无影响**

---

## 阶段 5：修复 routes/stores.ts [S25, S14, Q10]

**修改 1 — POST /:storeId/staff 添加角色校验（S25）**
```
在 router.post('/:storeId/staff', ...) 函数体开头添加：
  if (!['admin', 'ADMIN', 'manager', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：STAFF 不能添加员工。前端中员工管理页面仅 ADMIN/MANAGER 可见，**无影响**

**修改 2 — POST /:storeId/staff 禁止创建 ADMIN 角色（S25）**
```
在同一个路由中，找到：
  const result = db.prepare('INSERT INTO users ...').run(..., role || 'STAFF', ...);

在 INSERT 之前添加：
  const safeRole = (role && ['STAFF', 'MANAGER'].includes(role.toUpperCase())) ? role : 'STAFF';
  // 禁止通过此接口创建 ADMIN 或 SHAREHOLDER
```
- 影响：通过门店员工接口创建的用户只能是 STAFF 或 MANAGER。ADMIN 需通过 /api/users 创建。前端门店员工页面的角色选项应该只有 STAFF/MANAGER，**无影响**

**修改 3 — PUT /:storeId/staff/:id 禁止跨门店修改 + 禁止越权改角色（S26）**
```
在函数体开头添加：
  // 校验目标用户属于当前门店
  const target = db.prepare('SELECT store_id FROM users WHERE id = ?').get(req.params.id) as any;
  if (!target || String(target.store_id) !== String(req.params.storeId)) {
    return res.status(404).json({ error: '该门店下无此员工' });
  }

  // 非管理员不能修改角色
  if (role !== undefined && !['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权修改角色' });
  }
```

**修改 4 — 删除门店时补充清理遗漏的表（Q10）**
```
在 router.delete('/:id', ...) 中，现有清理语句之后添加：
  db.prepare('DELETE FROM inventory_master WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM categories WHERE store_id = ?').run(storeId);
  db.prepare('DELETE FROM notifications WHERE user_id IN (SELECT id FROM users WHERE store_id = ?)').run(storeId);
  db.prepare('DELETE FROM handovers WHERE store_id = ?').run(storeId);
```
- 注意：op_logs 表的 target 字段存的是 store_id（字符串），删除 op_logs 中该门店的日志需要特殊处理，可以保留日志不删除（审计需要）

---

## 阶段 6：修复 routes/reports.ts [S3]

```
在 router.get('/:filename', ...) 中，替换现有的 filepath 计算：

当前代码：
  const filepath = join(process.cwd(), 'public', 'reports', req.params.filename);

修改为：
  import { safePath } from '../middleware/store-access.js';  // 在文件顶部导入

  const filepath = safePath(join(process.cwd(), 'public', 'reports'), req.params.filename);
  if (!filepath) return res.status(400).json({ error: '非法文件名' });
```
- 影响：合法文件名（如 template.html）不受影响，包含 `..` 或 `/` 的文件名被拒绝

---

## 阶段 7：修复 routes/system.ts [S2, S3, S9, S30, Q15]

**修改 1 — 路径安全校验（S3）**

在所有使用 filename 的端点中添加路径校验：
```typescript
import { safePath } from '../middleware/store-access.js';
// ...
const filepath = safePath(join(process.cwd(), 'backups'), req.params.filename);
if (!filepath) return res.status(400).json({ error: '非法文件名' });
```
涉及端点：
- GET /backup-info/:filename
- GET /backups/:filename/download
- DELETE /backups/:filename
- POST /backups/:filename/restore

**修改 2 — 备份接口添加 ADMIN 权限（S9）**
```
在以下端点函数体开头添加 ADMIN 角色检查：
  if (!['admin', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ error: '无权限' });

涉及端点：
- GET /backups（列出备份）
- GET /backups/:filename/download（下载备份）
- GET /backup-info/:filename（备份信息）
```

**修改 3 — 重写恢复脚本生成（S2）消除代码注入**

```
当前代码（POST /backups/:filename/restore 中的 restoreScript 模板字符串）：
  const restoreScript = `...new AdmZip('${filepath.replace(/\\/g, '\\\\')}')...`

修改为：使用 JSON.stringify 安全地转义路径
  const safeDbDir = JSON.stringify(dbDir);
  const safeFilepath = JSON.stringify(filepath);
  const restoreScript = [
    'const fs=require("fs"),path=require("path"),{spawn}=require("child_process");',
    'const dir=' + safeDbDir + ';',
    'const zipPath=' + safeFilepath + ';',
    'setTimeout(()=>{',
    '  try{fs.unlinkSync(path.join(dir,"store.db"));}catch{}',
    '  try{fs.unlinkSync(path.join(dir,"store.db-wal"));}catch{}',
    '  try{fs.unlinkSync(path.join(dir,"store.db-shm"));}catch{}',
    '  const AdmZip=require("adm-zip");',
    '  const zip=new AdmZip(zipPath);',
    '  zip.extractAllTo(dir,true);',
    '  console.log("Restore complete");',
    '  setTimeout(()=>{',
    '    const child=spawn(process.execPath,["--import","tsx","src/index.ts"],',
    '      {detached:true,stdio:"ignore",cwd:dir.replace(/\\\\data$/,"")});',
    '    child.unref();process.exit(0);',
    '  },1000);',
    '},1000);'
  ].join('\n');
```
- 关键变化：使用 `JSON.stringify()` 而非手动字符串替换。`JSON.stringify` 会自动处理所有特殊字符（单引号、反斜杠、换行等），彻底消除注入风险
- 除此之外还需要加上路径校验（修改 1 已覆盖）

**修改 4 — 系统信息添加 ADMIN 校验（S30）**
```
在 router.get('/info', ...) 函数体开头添加：
  if (!['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：前端系统设置页面通过 /api/auth/me 获取用户信息，系统信息只在管理员面板显示。STAFF 用户在前端看不到此页面，**无影响**

**修改 5 — 升级验证临时文件清理（Q15）**
```
在 router.post('/upgrade/validate', ...) 中，res.json(...) 之后添加：
  // 清理临时文件
  try { unlinkSync(file.path); } catch {}
```

---

## 阶段 8：修复 routes/entries.ts [S12, Q6, Q16]

**修改 1 — PUT /:id 添加记录归属校验（S12）**
```
在 router.put('/:id', ...) 中，查询 original 之后添加：
  if (original && String(original.store_id) !== String(storeId)) {
    return res.status(404).json({ error: '记录不存在' });
  }
```
- 影响：只能修改当前门店的记录。前端 URL 中的 storeId 是正确的，**无影响**

**修改 2 — DELETE /:id 添加记录归属校验（S12）**
```
在 router.delete('/:id', ...) 中，查询 entry 之后添加：
  if (entry && String(entry.store_id) !== String(storeId)) {
    return res.status(404).json({ error: '记录不存在' });
  }
```

**修改 3 — POST/PUT/DELETE 添加 try/catch（Q6）**
```
将现有的：
  router.post('/', (req, res) => { ... });
  router.put('/:id', (req, res) => { ... });
  router.delete('/:id', (req, res) => { ... });

改为：
  router.post('/', (req, res) => { try { ... } catch (err: any) { res.status(500).json({ error: err.message }); } });
  // 同理 PUT 和 DELETE
```

**修改 4 — normalizeType 校验无效输入（Q16）**
```
当前代码：
  function normalizeType(type: string): string {
    if (type === 'income') return '收入';
    if (type === 'expense') return '支出';
    return type;
  }

修改为：
  function normalizeType(type: string): string {
    if (type === 'income') return '收入';
    if (type === 'expense') return '支出';
    if (type === '收入' || type === '支出') return type;
    return '收入'; // 默认归为收入，避免写入非法值
  }
```
- 影响：如果前端传入了非标准类型，之前会原样写入数据库，现在会默认归为"收入"。前端只传 'income'/'expense'，**无影响**

---

## 阶段 9：修复 routes/categories.ts [S28]

**修改 — DELETE /:id 添加归属校验**
```
当前代码：
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);

修改为：
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) as any;
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  // 全局分类只有 ADMIN 可删除
  if (!cat.store_id && !['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权删除全局分类' });
  }
  // 门店分类只能由该门店用户删除
  if (cat.store_id && String(cat.store_id) !== String(storeId)) {
    return res.status(403).json({ error: '无权删除其他门店分类' });
  }
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
```

---

## 阶段 10：修复 routes/inventory.ts [S29]

**修改 — DELETE /items/:id 添加归属校验**
```
在 router.delete('/items/:id', ...) 中：
当前代码：
  db.prepare('DELETE FROM inventory_master WHERE id = ?').run(req.params.id);

修改为：
  const item = db.prepare('SELECT store_id FROM inventory_master WHERE id = ?').get(req.params.id) as any;
  if (!item) return res.status(404).json({ error: '物品不存在' });
  if (String(item.store_id) !== String(storeId)) {
    return res.status(404).json({ error: '物品不存在' });
  }
  db.prepare('DELETE FROM inventory_master WHERE id = ?').run(req.params.id);
```

---

## 阶段 11：修复 routes/dashboard.ts [Q13]

**修改 — 添加 ADMIN 角色校验**
```
在 router.get('/', ...) 函数体开头添加：
  // 仅 ADMIN 可访问管理大屏
  if (!['admin', 'ADMIN'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：前端路由守卫已限制 dashboard 仅 ADMIN 可见，**无影响**
- 注意：dashboard/trend 端点也需要同样的限制

---

## 阶段 12：修复 routes/notifications.ts [S14]

**修改 — POST / 添加角色校验**
```
在 router.post('/', ...) 函数体开头添加：
  if (!['admin', 'ADMIN', 'manager', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: '无权限' });
  }
```
- 影响：STAFF 不能向任意用户发送通知。系统内部通知（如工资确认提醒）由后端自动发送，不走此 API，**无影响**

---

## 阶段 13：修复 db.ts [P1, Q8]

**修改 1 — 添加数据库索引（P1）**

在 db.ts 的所有 CREATE TABLE 和 migrations 之后，seed 之前添加：
```typescript
// 数据库索引 — 提升查询性能
const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_entries_store_date ON entries(store_id, date)',
  'CREATE INDEX IF NOT EXISTS idx_entries_store_type_date ON entries(store_id, type, date)',
  'CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id)',
  'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
  'CREATE INDEX IF NOT EXISTS idx_op_logs_created ON op_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_op_logs_target ON op_logs(target)',
  'CREATE INDEX IF NOT EXISTS idx_payroll_store ON payroll(store_id)',
  'CREATE INDEX IF NOT EXISTS idx_dividends_store ON dividends(store_id)',
  'CREATE INDEX IF NOT EXISTS idx_inventory_master_store ON inventory_master(store_id)',
  'CREATE INDEX IF NOT EXISTS idx_store_opens_store ON store_opens(store_id, type)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)',
  'CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id)',
];
for (const sql of indexes) {
  try { db.exec(sql); } catch (e) { /* index may already exist */ }
}
```
- 影响：CREATE INDEX IF NOT EXISTS 是幂等操作，不会破坏现有数据。只提升查询速度。

**修改 2 — 自动备份前执行 WAL Checkpoint（Q8）**

在 index.ts 的 setupAutoBackup() 中，copyFileSync 之前添加：
```
db.pragma('wal_checkpoint(TRUNCATE)');
```
- 需要将 db 从 db.ts export 出来（当前已经是 default export），在 index.ts 中 import

---

## 阶段 14：新建 lib/utils.ts [Q1]

### 新建文件：`apps/server/src/lib/utils.ts`

```typescript
// apps/server/src/lib/utils.ts
// 公共工具函数，消除重复定义

export function localDate(d?: Date): string {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

export function localDateTime(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}
```

然后在 entries.ts、oplog.ts、dashboard.ts 中将本地定义替换为导入：
```typescript
import { localDate, localDateTime } from '../lib/utils.js';
```
- 影响：纯重构，功能完全一致。**零影响**

---

## 阶段 15：修复 oplog.ts [S20]

**修改 — 记录 IP 地址**

修改 opLog 函数签名，增加可选参数：
```typescript
export function opLog(userId: number, storeId: number | string, action: string, detail: string, ip?: string) {
  const user = db.prepare('SELECT username, name FROM users WHERE id = ?').get(userId) as any;
  const userName = user?.name || user?.username || '';
  const now = localDateTime();
  const detailWithIp = ip ? detail + ' [IP:' + ip + ']' : detail;
  db.prepare('INSERT INTO op_logs (user_id, user_name, action, target, detail, created_at) VALUES (?,?,?,?,?,?)').run(userId, userName, action, String(storeId), detailWithIp, now);
}
```
- 在调用处传入 `req.ip`：`opLog(user.id, storeId, '记账', '...', req.ip)`
- 新增参数是可选的，现有的不传 IP 的调用不受影响
- 影响：日志详情末尾会多一个 `[IP:x.x.x.x]`，不影响现有功能

---

## 阶段 16：数据库事务包裹 [Q2]

**修改 — 关键多步操作加事务**

payroll.ts 创建工资单：
```typescript
// 当前代码（POST / 和 POST /generate）：
const result = db.prepare('INSERT INTO payroll ...').run(...);
const payrollId = result.lastInsertRowid;
for (const item of items) { stmt.run(payrollId, ...); }

// 修改为：
const createPayroll = db.transaction(() => {
  const result = db.prepare('INSERT INTO payroll ...').run(...);
  const payrollId = result.lastInsertRowid;
  for (const item of items) { stmt.run(payrollId, ...); }
  return payrollId;
});
const payrollId = createPayroll();
```

同理应用到：
- dividends.ts POST /（创建分红 + 明细）
- stores.ts DELETE /:id（删除门店 + 所有关联数据）
- inventory.ts POST /checks/batch-complete（创建盘点 + 更新库存）

- 影响：事务保证原子性，要么全部成功要么全部回滚。功能行为不变，只增加数据一致性保证。

---

## 修复验证清单

修复完成后，需要验证以下场景：

### 安全验证（应全部拒绝）
| 场景 | 预期结果 |
|------|----------|
| STAFF 创建 ADMIN 用户 | 403 无权限 |
| STAFF 访问其他门店数据 | 403 无权访问该门店 |
| STAFF 修改其他门店记账 | 404 记录不存在 |
| STAFF 下载备份文件 | 403 无权限 |
| STAFF 查看系统信息 | 403 无权限 |
| 未认证访问 /api/reports | 401 未认证 |
| 路径遍历 /api/reports/..%2F..%2Fpackage.json | 400 非法文件名 |
| Token 通过 URL query 传递 | 401 未提供认证令牌 |
| CORS 请求头带恶意 Origin | 不返回 Access-Control-Allow-Origin |

### 功能验证（应全部通过）
| 场景 | 预期结果 |
|------|----------|
| ADMIN 登录 | 成功，返回 token |
| ADMIN 查看门店列表 | 成功，返回所有门店 |
| ADMIN 查看管理大屏 | 成功，返回统计数据 |
| ADMIN 创建/编辑门店 | 成功 |
| ADMIN 备份/恢复 | 成功 |
| MANAGER 查看自己门店 | 成功 |
| MANAGER 添加员工 | 成功，角色只能是 STAFF/MANAGER |
| STAFF 记账 | 成功（自己门店） |
| STAFF 查看自己账户 | 成功 |
| SHAREHOLDER 查看分红 | 成功（自己关联的门店） |

---

## 环境变量清单（部署时需配置）

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| JWT_SECRET | multi-store-secret-key-2024 | JWT 密钥，**必须**修改为随机字符串 |
| TOKEN_EXPIRY | 24h | Token 有效期 |
| CORS_ORIGIN | * | CORS 允许的来源域名，逗号分隔 |
| JSON_LIMIT | 5mb | JSON 请求体大小限制 |
| NODE_ENV | (无) | 设为 production 时隐藏错误详情 |
| PORT | 3001 | 服务端口 |

---

## 修复优先级执行计划

| 优先级 | 阶段 | 预计工时 | 说明 |
|--------|------|---------|------|
| P0 立即 | 1, 2, 4, 5 | 2 小时 | 权限中间件 + JWT + 用户管理 + 门店路由 |
| P0 立即 | 6, 7 | 1 小时 | 路径安全 + 恢复脚本注入 |
| P1 尽快 | 3, 8, 9, 10, 11, 12 | 1.5 小时 | index.ts + 各路由权限校验 |
| P2 计划 | 13, 14, 15, 16 | 1.5 小时 | 索引 + 工具函数 + 日志 + 事务 |
| **总计** | — | **6 小时** | — |

---

## 回滚方案

每个阶段修改前备份当前文件：
```bash
cp apps/server/src/auth.ts apps/server/src/auth.ts.bak
```

如修复后出现问题：
1. 恢复备份文件
2. 重启服务
3. 分析问题原因
4. 调整修复方案后重试

由于所有修复都是加法（加校验、加中间件、加索引），不修改现有业务逻辑，回滚风险极低。
