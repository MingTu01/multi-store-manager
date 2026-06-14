# 多店铺管理系统 — 后端安全审查报告

> 审查时间：2026-06-14
> 审查范围：apps/server/src/ 全部后端源码
> 审查版本：v0.5.0 (215ae87)
> 语言风格：大白话，避免技术术语

---

## 一、后端安全边界审查

### 1.1 接口输入

**风险是什么？**
用户从前端发过来的数据可能被篡改。比如金额改成负数、角色改成管理员、把别人的门店ID传过来。

**当前处理位置和规则：**

| 位置 | 处理规则 | 问题 |
|------|----------|------|
| `auth.ts:19` 登录 | 检查用户名密码是否为空 | OK |
| `users.ts:52` 创建用户 | 检查用户名密码必填 | OK |
| `entries.ts:58` 新增记账 | 无金额范围校验 | **风险：可传负数或超大金额** |
| `stores.ts:66` 创建门店 | 只检查名称不为空 | OK |
| `payroll.ts` 生成工资 | 无金额校验 | **风险** |

**未验证的地方：**
- 记账金额没有上下限校验（可以传 -999999 或 999999999）
- 工资/分红金额没有范围校验
- 图片 base64 字符串没有大小限制校验（后端有 30MB 总限制，但单张图片无限制）

---

### 1.2 登录状态

**风险是什么？**
没有登录的人能不能访问系统？登录后 Token 能不能被伪造？

**当前处理：**
- `auth.ts:10-22` — 所有需要登录的接口都经过 `authMiddleware`，检查 `Authorization: Bearer xxx` 头
- `index.ts:49-67` — 路由注册时，除了 `/api/auth` 以外，所有路由都加了 `authMiddleware`
- Token 有效期 24 小时（可通过环境变量 `TOKEN_EXPIRY` 修改）
- JWT 密钥通过环境变量 `JWT_SECRET` 配置，默认值 `multi-store-secret-key-2024`

**风险点：**
- 默认密钥是公开的（在源码中），部署时必须修改
- Token 一旦签发，24 小时内无法撤销（用户被禁用后 Token 仍有效）

---

### 1.3 系统权限设计

**风险是什么？**
普通员工能不能看到管理员才能看的数据？能不能修改别人门店的数据？

**当前处理：**
- `middleware/store-access.ts:10-23` — 门店访问控制中间件，检查用户是否属于该门店
- `index.ts:50-56` — 所有门店子路由都挂载了 `requireStoreAccess` 中间件
- 各路由内部有角色检查（如 `users.ts` 检查 ADMIN/MANAGER）

**风险点：**
- 角色检查分散在各路由中，没有统一的中间件
- 部分路由缺少角色检查（见第四节详细表格）
- `requireRole` 中间件已定义但**从未使用**

---

### 1.4 密码规则

**风险是什么？**
弱密码容易被猜到，密码存储不安全会被泄露。

**当前处理：**
- `db.ts:161` — 默认管理员密码 `123456`，用 bcrypt 加密存储
- `auth.ts:29` — 登录用 `bcrypt.compareSync` 验证密码
- `users.ts:54` — 创建用户用 `bcrypt.hashSync(password, 10)` 加密
- `auth.ts:37` — 修改密码需要提供旧密码

**风险点：**
- **没有密码强度校验** — 可以设置密码为 `1` 或 `a`
- **没有密码长度要求** — 可以设置 1 位密码
- **默认密码 123456** — 新员工默认密码也是 123456，无强制修改机制
- **没有登录失败锁定** — 只有速率限制（10次/分钟），没有账号锁定

---

### 1.5 数据归属

**风险是什么？**
A 门店的员工能不能看到 B 门店的数据？能不能修改 B 门店的记账？

**当前处理：**
- `middleware/store-access.ts:10-23` — 检查用户 store_id 是否匹配，或是否是股东
- `entries.ts:83-86` — 修改/删除记账时检查 entry.store_id 是否匹配当前 URL 的 storeId
- `inventory.ts` — 删除物品时检查归属

**风险点：**
- `stores.ts:38` GET /:storeId — **任何登录用户都能查看任意门店详情**（包括股东信息、员工数）
- `stores.ts:139` GET /:storeId/stats — **任何登录用户都能查看任意门店的今日收支**
- `stores.ts:150` GET /:storeId/staff — **任何登录用户都能查看任意门店的员工列表**

---

### 1.6 注入风险

**风险是什么？**
用户输入的数据被当成代码执行，比如 SQL 注入、命令注入。

**当前处理：**
- 全部使用 `better-sqlite3` 的参数化查询（`db.prepare('...').get(params)`）
- `system.ts` 恢复脚本用 `JSON.stringify` 转义路径（防代码注入）
- `middleware/store-access.ts:42-55` — `safePath` 函数防止路径遍历

**风险点：**
- `entries.ts:36` — SQL 条件拼接用字符串 `whereClause += ' AND ...'`，但参数值用 `?` 占位符，**安全**
- `system.ts:176` — 重启命令用 `exec(cmd)` 执行系统命令，`cmd` 中包含 `process.cwd()`，**低风险但需注意**

---

## 二、接口输入安全审查

### 关键输入 vs 普通输入

**关键输入**（影响身份、权限、金额、数据归属）：

| 接口 | 关键参数 | 校验位置 | 校验规则 | 失败返回 | 风险 |
|------|----------|----------|----------|----------|------|
| POST /auth/login | username, password | auth.ts:19-20 | 不为空 | 400 | OK |
| POST /users | role, password, store_id | users.ts:52-53 | 用户名密码必填，角色统一大写 | 400 | **可传任意role（已大写化但无白名单）** |
| PUT /users/:id | role | users.ts:78-79 | 非管理员不能改role | 403 | OK |
| POST /entries | amount, type | entries.ts:58 | 无 | 无 | **可传负数金额** |
| PUT /entries/:id | amount, type | entries.ts:83 | 员工不能修改 | 403 | OK |
| POST /stores | shareholders | stores.ts:66 | 名称必填 | 400 | OK |
| POST /stores/:storeId/staff | role, password | stores.ts:160 | 名称手机号必填 | 400 | **role无白名单，可传ADMIN** |
| POST /payroll | items, amount | payroll.ts | 无金额校验 | 无 | **可传负数工资** |
| POST /dividends | total_amount | dividends.ts | 无金额校验 | 无 | **可传负数分红** |

**普通输入**（不影响安全的核心）：
- note, address, phone, avatar — 不影响系统安全
- date, month, year — 只影响查询范围

**关键风险总结：**
1. **金额无范围校验** — 记账、工资、分红都可以传负数或天文数字
2. **添加员工时 role 无白名单** — 虽然大写化了，但可以传 `ADMIN` 创建管理员
3. **门店详情无权限限制** — 任何登录用户都能看任意门店

---

## 三、密码和管理员账号安全审查

### 功能位置

| 功能 | 代码位置 | 说明 |
|------|----------|------|
| 注册/创建用户 | `users.ts:51-56` | 仅 ADMIN 可创建 |
| 登录 | `auth.ts:17-31` | 带速率限制 |
| 修改密码 | `auth.ts:60-72` | 需要旧密码 |
| 重置密码 | `users.ts:77` PUT | ADMIN 可直接重置，无需旧密码 |
| 创建管理员 | `users.ts:51-56` | 仅 ADMIN 可创建，role 大写化 |

### 密码强度检查

**当前规则：无**

测试：
- 密码 `1` → 可以创建 ✅ （不应允许）
- 密码 `123456` → 可以创建 ✅ （不应允许）
- 密码 `a` → 可以创建 ✅ （不应允许）

**建议：** 添加最小 6 位、至少包含字母和数字的校验。

### 密码存储

- 使用 bcrypt，cost factor 10 — **安全，不可逆**
- 密码哈希不暴露给前端 — `auth.ts:30` 返回时排除 `password_hash`

### 管理员额外约束

- 默认密码 `123456` — **高风险**，部署时必须修改
- 管理员重置他人密码无需对方旧密码 — `users.ts:77`，这是合理的
- 没有管理员操作二次确认（删除门店需要密码确认，这是好的）

---

## 四、系统权限设计审查

### 完整接口权限表

| 接口 | 需要登录 | 允许角色 | 数据归属检查 | 代码位置 | 无权限返回 |
|------|:--------:|:--------:|:------------:|----------|:----------:|
| POST /auth/login | ❌ | 所有人 | — | auth.ts:17 | — |
| GET /auth/me | ✅ | 所有角色 | 仅自己 | auth.ts:33 | 401 |
| PUT /auth/me | ✅ | 所有角色 | 仅自己 | auth.ts:42 | 401 |
| PUT /auth/password | ✅ | 所有角色 | 仅自己 | auth.ts:60 | 401 |
| GET /users | ✅ | ADMIN, MANAGER | — | users.ts:16 | 403 |
| GET /users/:id | ✅ | ADMIN, MANAGER, 自己 | 是 | users.ts:30 | 403 |
| POST /users | ✅ | ADMIN | — | users.ts:51 | 403 |
| PUT /users/:id | ✅ | ADMIN, 自己 | 是 | users.ts:72 | 403 |
| DELETE /users/:id | ✅ | ADMIN | — | users.ts:99 | 403 |
| GET /stores | ✅ | 所有角色 | 按角色过滤 | stores.ts:11 | 401 |
| **GET /stores/:storeId** | **✅** | **所有角色** | **❌ 无检查** | **stores.ts:38** | **无** |
| POST /stores | ✅ | ADMIN | — | stores.ts:64 | 403 |
| PUT /stores/:storeId | ✅ | ADMIN, STORE_ADMIN | — | stores.ts:89 | 403 |
| DELETE /stores/:id | ✅ | ADMIN | — | stores.ts:112 | 403 |
| **GET /stores/:storeId/stats** | **✅** | **所有角色** | **❌ 无检查** | **stores.ts:139** | **无** |
| **GET /stores/:storeId/staff** | **✅** | **所有角色** | **❌ 无检查** | **stores.ts:150** | **无** |
| POST /stores/:storeId/staff | ✅ | ADMIN | — | stores.ts:158 | 403 |
| PUT /stores/:storeId/staff/:id | ✅ | ADMIN | — | stores.ts:177 | 403 |
| DELETE /stores/:storeId/staff/:id | ✅ | ADMIN | — | stores.ts:194 | 403 |
| GET /stores/:storeId/shareholders | ✅ | 所有角色 | ❌ 无检查 | stores.ts:203 | 无 |
| PUT /stores/:storeId/shareholders | ✅ | ADMIN, STORE_ADMIN | — | stores.ts:212 | 403 |
| GET /stores/:storeId/notification-settings | ✅ | 所有角色 | ❌ 无检查 | stores.ts:229 | 无 |
| PUT /stores/:storeId/notification-settings | ✅ | 所有角色 | ❌ 无检查 | stores.ts:241 | 无 |
| POST /entries | ✅ | 所有角色 | 通过requireStoreAccess | entries.ts:58 | 403 |
| PUT /entries/:id | ✅ | 非STAFF | 是（检查store_id） | entries.ts:83 | 403/404 |
| DELETE /entries/:id | ✅ | 非STAFF | 是（检查store_id） | entries.ts:108 | 403/404 |
| GET /dashboard | ✅ | ADMIN | — | dashboard.ts:10 | 403 |
| GET /dashboard/trend | ✅ | ADMIN | — | dashboard.ts:111 | 403 |
| GET /system/info | ✅ | ADMIN | — | system.ts:31 | 403 |
| POST /system/backup | ✅ | ADMIN | — | system.ts:44 | 403 |
| GET /system/backups | ✅ | ADMIN | — | system.ts:73 | 403 |
| POST /system/restart | ✅ | ADMIN | — | system.ts:241 | 403 |
| POST /health-cert/ocr | ✅ | 所有角色 | 仅自己数据 | health-cert.ts:26 | 401 |
| PUT /health-cert/save | ✅ | 所有角色 | 仅自己数据 | health-cert.ts:99 | 401 |
| GET /logs | ✅ | 所有角色 | ❌ 无检查 | logs.ts | 无 |
| GET /reports | ✅ | 所有角色 | ❌ 无检查 | reports.ts | 无 |

**标记说明：**
- ❌ 无检查 = 任何登录用户都能访问，不需要特定角色
- 通过 requireStoreAccess = 由中间件统一检查门店归属

### 已验证的测试用例

| 测试 | 结果 |
|------|------|
| STAFF 创建 ADMIN 用户 | 403 拒绝 ✅ |
| STAFF 访问其他门店数据 | 403 拒绝 ✅ |
| STAFF 修改其他门店记账 | 404 拒绝 ✅ |
| STAFF 查看备份列表 | 403 拒绝 ✅ |
| 未认证访问 /api/reports | 401 拒绝 ✅ |
| 路径遍历攻击 | 400 拒绝 ✅ |

### 未验证的问题

| 问题 | 说明 |
|------|------|
| STAFF 能否访问 /stores/:storeId/stats | 未测试，可能泄露其他门店今日收支 |
| STAFF 能否访问 /stores/:storeId/staff | 未测试，可能泄露其他门店员工信息 |
| STAFF 能否访问 /logs | 未测试，可能看到所有操作日志 |
| Token 被禁用用户继续使用 | 未测试，Token 24h 内应仍有效 |

---

## 五、注入攻击防护审查

### SQL 注入

**结论：安全。** 全部使用 `better-sqlite3` 的参数化查询。

| 位置 | 方式 | 安全性 |
|------|------|--------|
| 所有 `db.prepare().get()` | 参数化查询 `?` 占位符 | ✅ 安全 |
| `entries.ts` WHERE 拼接 | 条件字符串拼接，但值用 `?` | ✅ 安全 |
| `users.ts` UPDATE 拼接 | SQL 字符串拼接，但值用 `?` | ✅ 安全 |

**注意：** 虽然值是安全的，但 SQL 字符串拼接模式容易出错。如果未来有人不小心把用户输入拼进 SQL 字符串（而不是参数），就会产生注入。

### 系统命令注入

| 位置 | 风险 | 说明 |
|------|------|------|
| `system.ts:249` 重启 | 低 | `process.cwd()` 是受控的，不是用户输入 |
| `system.ts:219` 恢复 | 低 | 用 `JSON.stringify` 转义了路径 |

### HTML/模板注入

**当前无此风险。** 后端只返回 JSON，不直接渲染 HTML。

---

## 六、过度防御与死代码审查

### 死代码（永远不会触发的防御）

| 位置 | 代码 | 问题 |
|------|------|------|
| `auth.ts:33-42` `requireFreshUser` | 从数据库重新读取用户角色 | **从未被任何路由调用**，是死代码 |
| `system.ts:160-161` auto-backup 路由 | 有重复的角色检查 | `if (...ADMIN...) return 403; if (...ADMIN...) return 403;` 检查了两次 |

### 过度防御

| 位置 | 说明 | 建议 |
|------|------|------|
| `stores.ts:64-66` POST / | ADMIN 检查 + requireStoreAccess 中间件 | 中间件已检查，路由内重复检查可以保留（防御性编程） |
| `entries.ts:83` PUT /:id | 同时检查 role 和 store_id | 合理，保留 |

### 缺少的必要校验（真实风险）

| 风险 | 位置 | 建议 |
|------|------|------|
| 金额无范围校验 | entries.ts, payroll.ts, dividends.ts | 添加 min=0, max=9999999 |
| 密码无强度校验 | users.ts, auth.ts | 添加最小6位，至少含字母 |
| 添加员工 role 无白名单 | stores.ts:160 | 只允许 STAFF/MANAGER |
| 门店详情无权限 | stores.ts:38 | 添加 requireStoreAccess 或角色检查 |
| Token 无法撤销 | auth.ts | 考虑 Token 黑名单或短有效期 |

---

## 总结：按优先级排序的整改建议

### 立即修复（安全关键）

1. **添加金额校验** — entries.ts, payroll.ts, dividends.ts 中的金额参数添加范围检查
2. **添加密码强度校验** — 最少6位，至少包含字母和数字
3. **修复 stores.ts 门店详情权限** — GET /:storeId, GET /:storeId/stats, GET /:storeId/staff 添加角色或归属检查
4. **添加员工 role 白名单** — stores.ts POST /:storeId/staff 只允许 STAFF/MANAGER

### 尽快修复（安全加固）

5. **删除或标记 requireFreshUser 死代码**
6. **修复 system.ts auto-backup 重复角色检查**
7. **统一错误返回格式** — 部分用 `err.message`，部分用中文提示
8. **添加 Token 撤销机制** — 用户被禁用后 Token 应立即失效

### 计划修复（长期改进）

9. **统一权限中间件** — 将分散在各路由的角色检查统一到中间件
10. **添加审计日志增强** — 记录所有敏感操作的 before/after
11. **添加 API 速率限制** — 除登录外，其他接口也需要限流
12. **添加输入消毒** — 对用户输入的字符串做长度限制和特殊字符过滤
