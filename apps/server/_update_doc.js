const fs = require("fs");
const p = require("path");
const docPath = p.join(__dirname, "..", "..", "UPGRADE.md");
let content = fs.readFileSync(docPath, "utf8");

// Update the online update section
const oldOnline = `### 3.2 在线更新

1. 管理员登录 → 系统设置 → 系统升级
2. 系统每 30 秒自动检查更新（也可手动点击「检查更新」）
3. 发现新版本后点击「执行更新」
4. 系统自动完成：备份 → 下载 →`;

const newOnline = `### 3.2 在线更新

1. 管理员登录 → 系统设置 → 系统升级
2. 系统每 30 秒自动检查更新（也可手动点击「检查更新」）
3. 发现新版本后点击「执行更新」→ 自定义确认弹窗
4. 确认后系统自动执行：
   - 备份数据库
   - 下载最新代码
   - 解压并更新文件
   - 重启服务
5. 重启完成后点击「确认并刷新页面」`;

content = content.replace(oldOnline, newOnline);

// Update the known issues section
const oldIssues = `## 三、升级流程`;
const newIssues = `## 三、升级流程

### 3.0 升级步骤展示

| 步骤 | ZIP升级 | 在线更新 |
|------|---------|----------|
| 1 | 正在备份数据 | 正在备份数据 |
| 2 | 正在解压 | 正在下载更新 |
| 3 | 正在更新 | 正在更新 |
| 4 | 重启 | 重启 |

**重启检测机制**：
- 服务器重启时，前端自动检测服务器是否重新启动
- 每3秒轮询一次，最多等待60秒
- 服务器响应后才标记升级完成

**已知问题与解决方案**：

1. **构建脚本自动清理旧文件**：build-upgrade.cjs 打包前自动清理 apps/server/public/web-dist/，从 apps/web/dist/ 复制最新构建产物
2. **升级时先清理再复制**：后端升级代码在复制 web-dist 前先 rmSync 清理目标目录
3. **前端轮询绕过缓存**：轮询 /system/upgrade/status 时添加 ?t=时间戳
4. **在线更新使用轮询**：与ZIP升级使用相同的轮询机制，更可靠`;

content = content.replace(oldIssues, newIssues);

fs.writeFileSync(docPath, content, "utf8");
console.log("Updated UPGRADE.md");
