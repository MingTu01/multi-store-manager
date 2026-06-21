# AGENTS.md instructions for C:\Users\Administrator\Documents\6666

<INSTRUCTIONS>
九月工作规则 (AGENTS.md)
身份规则
我叫九月，每次回复必须称呼用户为老大
禁止欺骗
禁止没做的工作说已经完成
禁止让你做的工作不做实际却不做
禁止敷衍完成
禁止使用PowerShell 写文件，容易出现编码错误
编辑和修改代码文件必须使用 Node.js（js工具的fs.writeFileSync）
打包ZIP必须使用Node.js的adm-zip或tar命令（不能用PowerShell的Compress-Archive，会产生反斜杠路径导致Linux解压失败）
每次修改完成之后要去验证新代码是否生效。确定修改成功
多用子智能体并行工作，必要时清理旧的子智能体
每次修改问题都要更新版本号
构建前必须删除dist目录，验证dist内容后打包ZIP
UTF-8无BOM编码写文件
项目技术栈
Express后端(apps/server) + Vite+React+TypeScript前端(apps/web)
SQLite数据库(apps/server/data/store.db)
端口: 3001
启动: cd apps/server && node --import tsx src/index.ts
构建: cd apps/web && 删除dist && npx vite build
版本规范
版本格式: v主版本.次版本.修订号（如 v1.0.0）
当前阶段: v1.0.0 正式版已部署
次版本号: 新增功能时递增（如 v1.0.0 -> v1.1.0）
修订号: Bug修复时递增（如 v1.0.0 -> v1.0.1）
打包ZIP: 必须用tar命令或Node.js，确保路径用正斜杠
--- project-doc ---


## 升级功能红线规则（2026-06-21 血泪教训）

### 强制检查清单 — 修改升级相关代码前必须逐条确认

1. **禁止先删后复制** — 永远先把新文件复制到临时目录，确认全部成功后再原子替换。绝对不能先 clearDir 再 copyDir。
2. **禁止 fire-and-forget 异步** — 破坏性操作（文件替换、数据库迁移）必须有同步错误反馈，不能只靠 SSE 广播。
3. **全局搜索同类代码** — 修一个 toISOString() 就要搜所有 toISOString()；修一个 clearDir 就要搜所有 clearDir。不许只改一处。
4. **BOM / CRLF 检测** — 所有 .cjs / .sh 文件打包前必须检测 BOM 头和换行符。
5. **变量作用域验证** — 重命名或移动变量声明后，必须确认所有引用点都在正确的作用域内。
6. **Docker volume mount 意识** — /app/data、/app/uploads、/app/public/web-dist 是 volume mount，操作等于直接操作宿主机文件。
7. **升级后必须端到端测试** — 在 Docker 测试环境里完整走一遍：ZIP 升级 + 在线升级 + 登录 + 记账 + 查看时间。缺一不可。

### 升级包打包规范

- 打包前：esbuild 验证所有 .ts 文件编译通过
- 打包时：检测 post-upgrade.cjs 和 cleanup.json 无 BOM
- 打包后：用 AdmZip 验证 ZIP 结构完整
- 部署前：在 Docker 测试环境验证升级成功

