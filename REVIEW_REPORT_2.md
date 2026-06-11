# 多店铺管理系统 代码审查报告（第二轮 — 审查第一份报告的准确性和遗漏）

> 审查时间：2026-06-11  
> 审查对象：REVIEW_REPORT_1.md  
> 审查方法：逐条验证第一份报告的结论，重新检查源码，补充遗漏项

---

## 一、第一份报告准确性验证

### 确认准确的发现

| 编号 | 结论 | 验证结果 |
|------|------|----------|
| S1 | JWT 密钥硬编码 | **准确**。auth.ts:4 确认 `'multi-store-secret-key-2024'` 硬编码 |
| S2 | 恢复接口代码注入 | **准确**。system.ts 确认 filename 拼入模板字符串仅转义反斜杠 |
| S3 | 路径遍历 | **准确**。system.ts 和 reports.ts 确认 filename 直接 join |
| S4 | 缺少门店级权限 | **准确**。全量路由审查确认无 store 归属校验 |
| S5 | 用户管理缺角色控制 | **准确**。users.ts 确认 GET/POST/DELETE 无角色校验 |
| S6 | 报表无认证 | **准确**。index.ts:41 确认无 authMiddleware |
| S7 | CORS 全开放 | **准确**。index.ts:12 确认 `cors()` 无参数 |
| S8 | 登录无限速 | **准确**。auth.ts 确认无限流中间件 |
| S9 | 备份下载无角色校验 | **准确**。system.ts 确认 download/backup-info 端点无角色检查 |
| S10 | 默认弱密码 | **准确**。db.ts 确认默认密码 123456 |
| Q2 | 缺少事务 | **准确**。payroll.ts、dividends.ts、stores.ts 确认无 transaction |
| P1 | 缺少索引 | **准确**。db.ts 确认无 CREATE INDEX |
| P3 | 循环查询 | **准确**。dashboard.ts trend 确认 30 次循环 2 查询 |

### 需要修正的发现

**S11 ZIP 升级 RCE 风险 — 严重程度需降级**
- 第一份报告列为高危，实际需要 ADMIN 权限才能触发。但结合 S1（JWT 密钥泄露可伪造 admin token），保持高危评级是合理的。
- **修正**：维持高危，但在修复建议中强调应同时修复 S1。

**S14 通知接口 — 文件名错误**
- 第一份报告中文件名写为 `routes/n.ts`，应为 `routes/notifications.ts`。
- **修正**：文件名为 `apps/server/src/routes/notifications.ts`。

**Q12 seed.ts shareholders 列名**
- 重新检查：`shareholders` 表确实没有 `user_id` 列（定义中只有 id, store_id, name, ratio, phone, created_at），但 seed.ts 中写了 `INSERT INTO shareholders (store_id, user_id, ratio)`。这在 SQLite 中会报错 `table shareholders has no column named user_id`。
- **结论准确**，但需补充：此问题导致种子数据无法写入，但因为 try/catch 静默失败，不会影响启动。

---

## 二、第一份报告遗漏的安全问题（补充发现）

### 补充 S23. 用户名信息泄露（登录时返回过多数据）
- **文件**：`apps/server/src/routes/auth.ts` POST `/login`
- **问题**：登录成功后返回完整用户对象（除 password_hash 外所有字段），包括 salary、address、phone、created_at 等敏感信息。
  ```javascript
  const { password_hash, ...userData } = user;
  res.json({ token, user: userData });
  ```
- **影响**：即使前端不展示这些字段，API 响应中已包含，可通过拦截获取。
- **严重程度**：中危

### 补充 S24. stores.ts GET /:storeId 无门店归属校验（加重 S4）
- **文件**：`apps/server/src/routes/stores.ts` GET `/:storeId`
- **问题**：不仅缺少门店归属校验，还返回了完整的股东信息（含 phone、ratio 等敏感数据）。
  ```javascript
  const shareholders = db.prepare('SELECT * FROM shareholders WHERE store_id = ?').all(store.id);
  res.json({ ...store, staff_count: staffCount, shareholders });
  ```
- **影响**：任何认证用户可查看任意门店的股权结构和股东个人信息。
- **严重程度**：高危（作为 S4 的补充）

### 补充 S25. stores.ts POST /:storeId/staff 无角色校验
- **文件**：`apps/server/src/routes/stores.ts` POST `/:storeId/staff`
- **问题**：任何认证用户可以在任意门店下创建员工，且可以指定 role 为 ADMIN。
- **严重程度**：严重（类似 S5，但走不同的路由）

### 补充 S26. stores.ts PUT /:storeId/staff/:id 无门店归属校验
- **文件**：`apps/server/src/routes/stores.ts` PUT `/:storeId/staff/:id`
- **问题**：不校验操作者是否属于该门店。任何认证用户可修改任意门店的员工信息。
- **严重程度**：高危

### 补充 S27. entries.ts PUT /:id 不校验修改者身份
- **文件**：`apps/server/src/routes/entries.ts` PUT `/:id`
- **问题**：任何认证用户可以修改任意门店的记账记录，包括 is_system 标记的系统自动生成记录（如工资支出、分红支出）。
  ```javascript
  db.prepare('UPDATE entries SET type=?,category=?,category_id=?,amount=?,note=?,date=? WHERE id=?')
    .run(nt, categoryName, catId, amount, note||'', date, req.params.id);
  ```
- **影响**：可以篡改系统自动记录的工资和分红支出条目，导致财务数据失真。
- **严重程度**：高危

### 补充 S28. categories.ts DELETE /:id 可删除全局分类
- **文件**：`apps/server/src/routes/categories.ts` DELETE `/:id`
- **问题**：不校验分类是否属于当前用户门店。全局分类（store_id 为 NULL）可被任意用户删除。
  ```javascript
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  ```
- **严重程度**：中危

### 补充 S29. inventory.ts DELETE /items/:id 无门店校验
- **文件**：`apps/server/src/routes/inventory.ts` DELETE `/items/:id`
- **问题**：不校验物品是否属于当前用户门店，可删除其他门店的库存物品。
- **严重程度**：高危

### 补充 S30. system.ts GET /info 暴露服务器内部信息
- **文件**：`apps/server/src/routes/system.ts` GET `/info`
- **问题**：无角色校验，任何认证用户可获取：
  - CPU 使用率和核心数
  - 内存使用量和总量
  - Node.js 版本
  - 数据库文件大小
  - 服务器运行时间
  - 用户数、门店数、记录数
- **影响**：暴露服务器硬件配置和运行状态，便于攻击者评估攻击可行性。
- **严重程度**：中危

### 补充 S31. system.ts POST /restart 允许任何认证用户重启服务器
- **文件**：`apps/server/src/routes/system.ts` POST `/restart`
- **问题**：虽然检查了 ADMIN 角色，但重启操作本身是一个高风险功能。如果管理员会话被劫持，可导致服务中断。
- **严重程度**：中危（已有 ADMIN 校验，风险可控）

### 补充 S32. handovers.ts 与 shifts.ts 重复且都缺乏门店归属校验
- **文件**：`apps/server/src/routes/handovers.ts`
- **问题**：handovers.ts 实际查询的是 `store_opens` 表（不是 handovers 表），且使用 URL 中的 storeId 直接查询，无归属校验。
- **严重程度**：高危（S4 的延伸）

---

## 三、第一份报告遗漏的代码质量问题

### 补充 Q13. dashboard.ts GET / 缺少 ADMIN 角色校验
- **文件**：`apps/server/src/routes/dashboard.ts`
- **问题**：该端点返回所有门店的财务汇总数据（收入、支出、利润、按分类统计），但仅依赖前端路由守卫限制 ADMIN 访问，后端不检查角色。
- 修复：添加 `if (req.user.role !== 'ADMIN') return res.status(403)` 校验。

### 补充 Q14. stores.ts GET / 的 SHAREHOLDER 匹配逻辑脆弱
- **文件**：`apps/server/src/routes/stores.ts` GET `/`
- **问题**：对于非 admin 且没有 store_id 的用户，通过 `sh.name = user.username` 匹配股东。这意味着股东名字必须精确等于用户名才能看到门店。
  ```javascript
  stores = db.prepare('SELECT s.* FROM stores s JOIN shareholders sh ON s.id = sh.store_id WHERE sh.name = ?')
    .all(user.username);
  ```
- 如果股东名字和用户名不一致（如股东名 "张三"，用户名 "zhangsan"），则看不到门店。
- **建议**：应建立 shareholders 和 users 表的关联关系。

### 补充 Q15. system.ts 上传临时文件未清理
- **文件**：`apps/server/src/routes/system.ts`
- **问题**：升级验证端点 `POST /upgrade/validate` 使用 multer 上传临时文件到 `uploads/` 目录，但验证完成后没有删除临时文件。
  ```javascript
  // validate 端点读取 ZIP 信息后返回，但 file.path 临时文件仍在
  res.json({ version, file: file.originalname, valid: true });
  // 缺少: unlinkSync(file.path)
  ```
- **影响**：磁盘空间逐渐耗尽。

### 补充 Q16. entries.ts 的 normalizeType 不处理无效输入
- **文件**：`apps/server/src/routes/entries.ts`
- **问题**：如果 type 既不是 'income' 也不是 'expense'，直接原样返回。数据库中可能写入非标准类型值。
  ```javascript
  function normalizeType(type: string): string {
    if (type === 'income') return '收入';
    if (type === 'expense') return '支出';
    return type; // 直接返回原值，不做校验
  }
  ```
- **建议**：应添加校验，拒绝无效类型。

### 补充 Q17. 多处使用 require('fs') 但未声明依赖
- **文件**：`system.ts`、`index.ts`
- **问题**：运行时使用 `require('adm-zip')` 和 `require('fs')`，但 `adm-zip` 是通过 package.json 声明的，而 `require('child_process')` 是 Node 内置模块。混用 import/require 在 ESM 项目中可能导致打包问题。

---

## 四、第一份报告遗漏的性能问题

### 补充 P6. dashboard.ts GET / 每次请求执行 12+ 次独立 SQL 查询
- **文件**：`apps/server/src/routes/dashboard.ts`
- **问题**：主端点一次请求中执行了：ci/ce/pi/pe/yi/ye 共 6 次聚合查询 + incomeByCategory + expenseByCategory + 全部门店独立查询。如果门店数量为 N，总查询数约 6 + 2 + N*2。
- **建议**：合并为少量 GROUP BY 查询。

### 补充 P7. report.ts 中 YoY 计算使用 UTC 时区而非本地时区
- **文件**：`apps/server/src/routes/report.ts`
- **问题**：使用 `new Date(dateStr).toISOString()` 计算日期范围，这会经过 UTC 转换。但数据库中存储的是本地日期字符串。两者可能存在一天偏差。
  ```javascript
  const prev = new Date(d); prev.setDate(prev.getDate() - 1);
  prevStart = prevEnd = prev.toISOString().slice(0, 10); // UTC 时间
  ```
  而 index.ts 设置了 `process.env.TZ = 'Asia/Shanghai'`，`new Date()` 返回的是本地时间，但 `.toISOString()` 总是 UTC。
- **影响**：在 UTC+8 时区，晚间 16:00-24:00 的日期计算可能偏差一天。
- **建议**：统一使用本地时间的日期格式化函数。

### 补充 P8. stores.ts GET / 中 SHAREHOLDER 路径执行 3 次查询
- **问题**：对于 SHAREHOLDER 用户，先查所有门店，再对每个门店分别查 staffCount 和 shareholders。
- **建议**：使用 JOIN 合并查询。

---

## 五、修正后的统计汇总

| 类别 | 严重 | 高危 | 中危 | 低危 | 合计 |
|------|------|------|------|------|------|
| 安全漏洞 | 7 | 12 | 8 | 3 | **30** |
| 代码质量 | - | - | - | - | **17** |
| 性能优化 | - | - | - | - | **8** |
| **总计** | - | - | - | - | **55** |

### 新增的高优先级修复项

**S25** stores.ts POST /:storeId/staff 无角色校验 — 任何用户可创建 ADMIN 账号（严重）

**S24** 股东敏感数据泄露 — 任何用户可查看任意门店股权结构（高危）

**S27** 系统生成的记账记录可被任意用户篡改（高危）

**P7** 时区处理不一致 — 夜间报表数据可能偏差一天（高危）
