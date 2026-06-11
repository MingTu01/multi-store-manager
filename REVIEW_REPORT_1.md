# 多店铺管理系统 代码审查报告（第一轮）

> 审查时间：2026-06-11  
> 审查范围：后端全部源码（apps/server/src/）、前端核心文件（App.tsx, permissions.ts, api.ts, data.ts, StoreGuard.tsx）  
> 审查重点：安全漏洞、权限暴露、数据泄露、代码质量、性能优化  
> 约束：前端和操作逻辑不做修改，仅出报告

---

## 一、安全漏洞（按严重程度排序）

### 严重 CRITICAL 6项

**S1. JWT 密钥硬编码在源码中**
- 文件：`apps/server/src/auth.ts:4`
- 问题：`const SECRET = 'multi-store-secret-key-2024';`
- 影响：任何获得源码访问权限的人都可以伪造任意用户 Token（包括管理员）。所有部署实例共享同一可预测密钥。
- 修复：使用 `process.env.JWT_SECRET`，启动时校验必须存在，密钥长度至少 32 字节。

**S2. 备份恢复接口存在代码注入漏洞（RCE）**
- 文件：`apps/server/src/routes/system.ts` POST `/backups/:filename/restore`
- 问题：生成 `_restore.js` 脚本时，`req.params.filename` 通过模板字符串拼接到 JS 代码中，仅做了反斜杠替换，未转义单引号。
  ```
  const restoreScript = `...new AdmZip('${filepath.replace(/\\/g, '\\\\')}')...`
  ```
  如果 filename 含 `'); process.exit(); ('` 则直接注入任意 JS 代码。
- 影响：服务器端任意代码执行（RCE）。
- 修复：不动态生成脚本文件；或对 filename 做严格白名单校验（仅允许字母数字和连字符）。

**S3. 路径遍历漏洞 — 可读取/删除/泄露任意服务器文件**
- 文件：`apps/server/src/routes/system.ts`、`routes/reports.ts`
- 受影响端点：
  - `GET /api/system/backups/:filename/download` — 下载任意文件
  - `GET /api/system/backup-info/:filename` — 获取任意文件元信息
  - `DELETE /api/system/backups/:filename` — 删除任意文件
  - `GET /api/reports/:filename` — 读取任意文件
- 问题：`req.params.filename` 直接传入 `path.join(cwd, 'backups', filename)`，含 `../` 时可逃逸目录。`path.join('/app/server','backups','../../../etc/passwd')` = `/etc/passwd`。
- 影响：任意文件读取和删除（需认证但无需管理员权限）。
- 修复：校验 filename 不含 `/` 或 `..`，或 resolve 后检查前缀仍在目标目录内。

**S4. 后端缺少门店级权限校验**
- 文件：几乎所有路由文件（entries.ts, inventory.ts, payroll.ts, dividends.ts, shifts.ts, handovers.ts, categories.ts, report.ts, stores.ts）
- 问题：后端使用 URL 中的 `storeId` 直接查库，从不校验当前用户是否属于该门店。前端有 `StoreGuard` 页面守卫，但后端完全没有。
- 攻击方式：STAFF 用户只需改 API 请求中的 storeId，即可读写其他门店的财务/工资/分红数据。
- 修复：添加门店归属中间件，ADMIN 可访问所有，其他角色仅访问其 store_id 对应门店。

**S5. 用户管理接口缺少角色权限控制**
- 文件：`apps/server/src/routes/users.ts`
- 问题明细：
  1. `GET /` — 任何认证用户可列出全部用户（含工资、地址），无角色校验
  2. `GET /:id` — 任何认证用户可查看任意用户详情
  3. `POST /` — 任何认证用户可创建新用户，包括设 role='ADMIN'（普通员工可创建管理员）
  4. `DELETE /:id` — 任何认证用户可删除任意用户，无角色校验
  5. `PUT /:id` — 非管理员可修改自己的 role 字段（提权）
- 影响：完整权限提升攻击链。STAFF 可创建 ADMIN 或直接提权。
- 修复：GET 限制 ADMIN/MANAGER，POST/DELETE 限制 ADMIN，PUT 禁止非管理员改 role。

**S6. 报表接口无认证保护**
- 文件：`apps/server/src/index.ts:41`
- 问题：`app.use('/api/reports', reportsRouter);` 无 `authMiddleware`。
- 影响：任何人无需登录即可列出和下载所有报表文件。
- 修复：添加 `authMiddleware`。

---

### 高危 HIGH 8项

**S7. CORS 完全开放**
- 文件：`apps/server/src/index.ts:12`
- 问题：`app.use(cors())` 允许任意来源跨域请求。
- 影响：恶意网站可利用已登录用户的 Token 直接调用 API。
- 修复：`cors({ origin: ['https://your-domain.com'] })`

**S8. 登录接口无速率限制**
- 文件：`apps/server/src/routes/auth.ts` POST `/login`
- 问题：无任何登录频率限制。
- 影响：可无限制暴力破解密码，结合默认弱密码极易攻破。
- 修复：使用 `express-rate-limit`，每 IP 每分钟最多 10 次。

**S9. 备份下载/列表接口缺少管理员权限**
- 文件：`apps/server/src/routes/system.ts`
- 问题：`GET /backups`、`GET /backups/:filename/download`、`GET /backup-info/:filename` 均无角色检查。
- 影响：任何认证用户（含 STAFF）可下载完整数据库备份（含密码哈希、全部财务数据）。
- 修复：添加 ADMIN 角色校验。

**S10. 默认弱密码策略**
- 文件：`apps/server/src/db.ts:154`、`routes/stores.ts` POST `/:storeId/staff`
- 问题：默认管理员密码 `123456`，新建员工默认密码 `123456`，密码修改无复杂度要求。
- 修复：强制密码最少 8 位含大小写数字，首次登录强制改密。

**S11. ZIP 升级功能存在 RCE 风险**
- 文件：`apps/server/src/routes/system.ts` POST `/upgrade`
- 问题：接受上传 ZIP，解压后直接覆盖服务器源码文件并重启。
- 影响：管理员账号被盗后可上传恶意代码获取完全服务器控制权。
- 修复：添加 ZIP 签名校验，限制可覆盖路径。

**S12. 写操作缺少记录归属校验**
- 文件：`entries.ts`、`inventory.ts`、`categories.ts`
- 问题：DELETE/PUT 仅用记录 ID，不校验记录是否属于当前用户门店。
  ```
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);  // 不检查 store_id
  ```
- 影响：遍历 ID 可跨门店删除/修改数据。
- 修复：所有写操作加 `AND store_id = ?` 条件。

**S13. Token 可通过 URL 查询参数传递**
- 文件：`apps/server/src/auth.ts:12`
- 问题：`req.query.token` 支持 URL 传递 Token。
- 影响：Token 出现在服务器日志、浏览器历史、Referer 头中。
- 修复：移除 query 参数支持，仅用 Authorization Header。

**S14. 通知接口可向任意用户发送消息**
- 文件：`apps/server/src/routes/n.ts` POST `/`
- 问题：任何认证用户可指定 user_id 向系统任意用户发通知。
- 修复：限制为 ADMIN/MANAGER 或仅同门店用户。

---

### 中危 MEDIUM 5项

**S15. 错误信息泄露内部细节** — `err.message` 直接返回客户端，泄露 DB 结构、文件路径、SQL 错误。

**S16. 登录错误信息用户枚举** — "用户不存在"和"密码错误"返回不同消息，可判断用户名是否存在。

**S17. Token 有效期 7 天过长** — 财务系统建议 2-4 小时 + Refresh Token。

**S18. JWT Payload 含角色信息不实时校验** — 角色/门店变更后旧 Token 仍保持原权限直至过期。

**S19. 角色大小写不一致** — 创建用户默认 `'staff'`（小写），后端同时检查 `'admin'`/`'ADMIN'`，前端用大写枚举。可能导致权限判断混乱。

---

### 低危 LOW 3项

**S20. 操作日志不记录 IP 和 User-Agent** — 安全事件无法追溯来源。

**S21. Token 存储在 localStorage** — 易被 XSS 窃取，建议 HttpOnly Cookie。

**S22. 通知设置中企业微信 Secret 等明文存储** — 应加密或用环境变量。

---

## 二、代码质量问题 12项

**Q1. 工具函数重复定义** — `localDate()` 和 `localDateTime()` 在 entries.ts、oplog.ts、dashboard.ts 各写一遍，应提取到 utils.ts。

**Q2. 缺少数据库事务** — payroll 创建、dividend 创建、门店删除等多步操作未用 `db.transaction()`，部分失败时数据不一致。

**Q3. ES Module 和 CommonJS 混用** — index.ts 和 system.ts 同时用 import 和 require()。

**Q4. N+1 查询** — stores.ts GET `/`、payroll.ts GET `/`、dividends.ts GET `/` 列表后逐条查关联数据，应改用 JOIN 或批量查询。

**Q5. handovers.ts 和 shifts.ts 功能重复** — 都查 store_opens 表，应合并。

**Q6. 部分路由缺少 try/catch** — entries.ts 的 POST/PUT/DELETE 未包裹异常处理。

**Q7. req.user 类型为 any** — TypeScript 类型安全形同虚设，应定义完整 User 接口。

**Q8. 自动备份未执行 WAL Checkpoint** — 直接 copyFileSync 复制数据库，WAL 模式下备份可能不完整。

**Q9. setInterval 定时不精确** — 每分钟检查一次，重启可能错过精确触发时间，建议用 node-cron。

**Q10. 删除门店遗漏清理表** — 清理了 shareholders/entries 等，但遗漏了 inventory_master、categories、notifications、op_logs。

**Q11. 文档文件编码损坏** — README.md 和 ARCHITECTURE.md 中文内容为乱码（mojibake）。

**Q12. seed.ts 中 shareholders 表引用不存在的 user_id 列** — 表定义中无此列。

---

## 三、性能优化建议 5项

**P1. 缺少数据库索引** — 无任何自定义索引。建议添加：
```sql
CREATE INDEX idx_entries_store_date ON entries(store_id, date);
CREATE INDEX idx_entries_type ON entries(store_id, type, date);
CREATE INDEX idx_users_store ON users(store_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_op_logs_created ON op_logs(created_at);
CREATE INDEX idx_op_logs_target ON op_logs(target);
```

**P2. 同步数据库操作阻塞事件循环** — better-sqlite3 是同步库，长查询会阻塞。小规模可接受，大数据量考虑 Worker Thread。

**P3. 报表查询全表扫描 + 循环查询** — dashboard/trend 端点一次请求执行 30~120 次独立 SUM 查询，应改为一条 GROUP BY。

**P4. JSON 列重复解析** — shifts.ts/handovers.ts 每次请求都 JSON.parse(photos)。

**P5. express.json limit 50MB 过大** — 可能导致内存耗尽，应降至 1-5MB，图片走独立 multipart 处理。

---

## 四、统计汇总

| 类别 | 严重 | 高危 | 中危 | 低危 | 合计 |
|------|------|------|------|------|------|
| 安全漏洞 | 6 | 8 | 5 | 3 | 22 |
| 代码质量 | - | - | - | - | 12 |
| 性能优化 | - | - | - | - | 5 |
| **总计** | - | - | - | - | **39** |

### 优先修复建议

**立即修复 P0**：S1 JWT密钥、S2 代码注入、S3 路径遍历、S4 门店权限、S5 用户权限、S6 报表认证

**尽快修复 P1**：S9 备份权限、S7 CORS、S8 速率限制、S12 写操作校验、P1 数据库索引

**计划修复 P2**：其余安全和质量问题
