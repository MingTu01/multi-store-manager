import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'fs';
import db from './db.js';
import { triggerNotification } from './notify-trigger.js';
import { buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder, buildDailyReportForStore, buildWeeklyReportForStore, buildMonthlyReportForStore, buildReviewReminderForStore } from './notify.js';
import { BASE_DIR } from './app.js';
import logger from './logger.js';

// ===== 自动备份：Cron 表达式支持 =====

// 默认表达式：每日 03:00 备份一次
const CRON_DEFAULT = '0 3 * * *';

// 解析单个 cron 字段为匹配值列表；非法返回 null
// 支持：* 、*/n 、a 、a-b 、a-b/n 以及逗号组合
function parseCronField(field: string, min: number, max: number): number[] | null {
  const values = new Set<number>();
  for (const part of field.split(',')) {
    const m = part.match(/^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[2] ? parseInt(m[2], 10) : 1;
    if (!Number.isInteger(step) || step < 1) return null;
    let lo = min, hi = max;
    if (m[1] !== '*') {
      if (m[1].includes('-')) {
        const [a, b] = m[1].split('-').map(Number);
        lo = a; hi = b;
      } else {
        lo = hi = Number(m[1]);
      }
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) values.add(v);
  }
  return values.size ? [...values] : null;
}

// 校验 5 段式 cron 表达式（分 时 日 月 周）
export function isValidCron(expr: string): boolean {
  if (typeof expr !== 'string') return false;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  return !!parseCronField(fields[0], 0, 59)
    && !!parseCronField(fields[1], 0, 23)
    && !!parseCronField(fields[2], 1, 31)
    && !!parseCronField(fields[3], 1, 12)
    && !!parseCronField(fields[4], 0, 7); // 周字段 0/7 均表示周日
}

// 上海时区时间字段（缓存 formatter，避免循环内重复创建）
const shFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short',
});
const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// 构建 cron 匹配器（每次检查构建一次，循环内复用）
function buildCronMatcher(expr: string): (ts: number) => boolean | null {
  const fields = expr.trim().split(/\s+/);
  const mins = parseCronField(fields[0], 0, 59);
  const hours = parseCronField(fields[1], 0, 23);
  const doms = parseCronField(fields[2], 1, 31);
  const months = parseCronField(fields[3], 1, 12);
  const dowsRaw = parseCronField(fields[4], 0, 7);
  if (!mins || !hours || !doms || !months || !dowsRaw) return null;
  const dows = [...new Set(dowsRaw.map(d => d % 7))]; // 7 → 0（周日）
  const domRestricted = fields[2] !== '*';
  const dowRestricted = fields[4] !== '*';
  return (ts: number) => {
    const p: Record<string, string> = {};
    for (const part of shFormatter.formatToParts(new Date(ts))) p[part.type] = part.value;
    if (!mins.includes(parseInt(p.minute, 10))) return false;
    if (!hours.includes(parseInt(p.hour, 10))) return false;
    if (!months.includes(parseInt(p.month, 10))) return false;
    const domMatch = doms.includes(parseInt(p.day, 10));
    const dowMatch = dows.includes(WEEKDAY_MAP[p.weekday] ?? -1);
    // 标准 cron 语义：日与周都受限时，任一匹配即触发
    if (domRestricted && dowRestricted) return domMatch || dowMatch;
    return domMatch && dowMatch;
  };
}

// 自动备份调度器（每 5 分钟检查一次，按 cron 表达式触发）
export function setupAutoBackup() {
  setInterval(() => {
    try {
      const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
      if (!existsSync(configPath)) return;
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!config.enabled) return;

      // cron 表达式；兼容旧版 interval 字段（hourly/daily/weekly → cron）
      let cron = typeof config.cron === 'string' && isValidCron(config.cron) ? config.cron.trim() : null;
      if (!cron) {
        cron = config.interval === 'hourly' ? '0 * * * *'
          : config.interval === 'weekly' ? '0 3 * * 1'
          : CRON_DEFAULT;
      }
      const matcher = buildCronMatcher(cron);
      if (!matcher) return;

      const now = Date.now();
      // 从上次检查时间逐分钟扫描到现在，找出应触发的时间点（最多回溯 24 小时）
      let lastCheck = config.lastBackupCheck ? new Date(config.lastBackupCheck).getTime() : 0;
      if (!lastCheck || now - lastCheck > 86400000) lastCheck = now - 86400000;
      const lastRun = config.lastBackupRun ? new Date(config.lastBackupRun).getTime() : 0;

      let fire = false;
      for (let t = Math.ceil((lastCheck + 1) / 60000) * 60000; t <= now; t += 60000) {
        if (t <= lastRun) continue;
        if (matcher(t)) { fire = true; break; }
      }

      if (!fire) {
        // 记录检查时间，避免下次重复扫描
        config.lastBackupCheck = new Date(now).toISOString();
        writeFileSync(configPath, JSON.stringify(config, null, 2));
        return;
      }

      const backupDir = join(BASE_DIR, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const ts = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'auto-backup-' + ts + '.db';
      // Q8: 备份前执行 WAL checkpoint
      db.pragma('wal_checkpoint(TRUNCATE)');
      const backupPath = join(backupDir, filename);
      db.exec("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");

      config.lastBackupRun = new Date(now).toISOString();
      config.lastBackupCheck = config.lastBackupRun;
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      // 按保留份数清理旧备份（默认 30），按修改时间新→旧排序，只清理自动备份文件
      const keep = Math.min(100, Math.max(1, Math.floor(Number(config.keepCount)) || 30));
      const files = readdirSync(backupDir)
        .filter(f => f.startsWith('auto-backup-') && f.endsWith('.db'))
        .map(f => ({ f, m: statSync(join(backupDir, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m);
      for (const old of files.slice(keep)) {
        try { unlinkSync(join(backupDir, old.f)); logger.info('Auto backup cleaned:', old.f); } catch {}
      }

      logger.info('Auto backup created:', filename, '(cron:', cron + ')');
    } catch (err) { logger.error('Auto backup error:', err); }
  }, 300000);
}

// 通知定时任务（带数据库防重执行标记）
// 使用显式 Asia/Shanghai 时区，避免服务器时区不一致导致推送时间偏移
export function setupCron() {
  db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");

  setInterval(() => {
    try {
      const lastRun = db.prepare("SELECT value FROM app_settings WHERE key='last_cron_run'").get() as any;
      if (lastRun && Date.now() - parseInt(lastRun.value) < 60000) return;
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_cron_run', ?)").run(Date.now().toString());

      // 使用 Asia/Shanghai 时区获取当前时间
      const nowSH = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
      const h = nowSH.getHours(), m = nowSH.getMinutes(), day = nowSH.getDay(), date = nowSH.getDate();
      const stores = db.prepare('SELECT id, name FROM stores').all() as any[];

      // 每日 22:00 — 每日经营简报
      if (h === 22 && m === 0) {
        // ADMIN 收全店汇总
        triggerNotification({ type: 'daily_report', action: '推送日报', detail: buildDailyReport(), operatorName: '系统' });
        // 每个店铺管理员+店长收自己店铺的报表（getTargetUsers 中 daily_report 发给 STORE_ADMIN+MANAGER）
        for (const s of stores) {
          triggerNotification({ type: 'daily_report', action: '推送日报', detail: buildDailyReportForStore(s.id), storeId: s.id, operatorName: '系统' });
        }
      }

      // 每周一 09:00 — 每周经营报告
      if (day === 1 && h === 9 && m === 0) {
        triggerNotification({ type: 'weekly_report', action: '推送周报', detail: buildWeeklyReport(), operatorName: '系统' });
        // weekly_report 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'weekly_report', action: '推送周报', detail: buildWeeklyReportForStore(s.id), storeId: s.id, operatorName: '系统' });
        }
      }

      // 每月1日 09:00 — 月度经营报告
      if (date === 1 && h === 9 && m === 0) {
        triggerNotification({ type: 'monthly_report', action: '推送月报', detail: buildMonthlyReport(), operatorName: '系统' });
        // monthly_report 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'monthly_report', action: '推送月报', detail: buildMonthlyReportForStore(s.id), storeId: s.id, operatorName: '系统' });
        }
      }

      // 每日 09:00 — 待处理事项提醒（MANAGER 不收）
      if (h === 9 && m === 0) {
        // ADMIN 收所有店铺的汇总
        triggerNotification({ type: 'review_reminder', action: '推送待办提醒', detail: buildReviewReminder(), operatorName: '系统' });
        // review_reminder 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'review_reminder', action: '推送待办提醒', detail: buildReviewReminderForStore(s.id), storeId: s.id, operatorName: '系统' });
        }
      }
    } catch (err) {
      logger.error('[Cron] setupCron interval error:', err);
    }
  }, 60000);
}
