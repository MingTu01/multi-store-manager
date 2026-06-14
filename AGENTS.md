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
