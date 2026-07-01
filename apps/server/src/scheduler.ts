import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import db from './db.js';
import { triggerNotification } from './notify-trigger.js';
import { buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder, buildDailyReportForStore, buildWeeklyReportForStore, buildMonthlyReportForStore, buildReviewReminderForStore } from './notify.js';
import { BASE_DIR } from './app.js';
import logger from './logger.js';

// 自动备份调度器
export function setupAutoBackup() {
  setInterval(() => {
    try {
      const configPath = join(BASE_DIR, 'data', 'auto-backup.json');
      if (!existsSync(configPath)) return;
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (!config.enabled) return;

      const now = new Date();
      const lastKey = 'lastBackup_' + config.interval;
      const lastStr = config[lastKey];
      if (lastStr) {
        const last = new Date(lastStr);
        const diff = now.getTime() - last.getTime();
        const intervalMs = config.interval === 'hourly' ? 3600000 : config.interval === 'daily' ? 86400000 : 604800000;
        if (diff < intervalMs) return;
      }

      const backupDir = join(BASE_DIR, 'backups');
      mkdirSync(backupDir, { recursive: true });
      const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = 'auto-backup-' + config.interval + '-' + ts + '.db';
      // Q8: 备份前执行 WAL checkpoint
      db.pragma('wal_checkpoint(TRUNCATE)');
      const backupPath = join(backupDir, filename);
      db.exec("VACUUM INTO '" + backupPath.replace(/'/g, "''") + "'");

      config[lastKey] = now.toISOString();
      writeFileSync(configPath, JSON.stringify(config, null, 2));

      const files = readdirSync(backupDir).filter(f => f.startsWith('auto-backup-')).sort();
      while (files.length > 30) { const old = files.shift()!; unlinkSync(join(backupDir, old)); }

      logger.info('Auto backup created:', filename);
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
        triggerNotification({ type: 'daily_report', action: buildDailyReport() });
        // 每个店铺管理员+店长收自己店铺的报表（getTargetUsers 中 daily_report 发给 STORE_ADMIN+MANAGER）
        for (const s of stores) {
          triggerNotification({ type: 'daily_report', action: buildDailyReportForStore(s.id), storeId: s.id });
        }
      }

      // 每周一 09:00 — 每周经营报告
      if (day === 1 && h === 9 && m === 0) {
        triggerNotification({ type: 'weekly_report', action: buildWeeklyReport() });
        // weekly_report 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'weekly_report', action: buildWeeklyReportForStore(s.id), storeId: s.id });
        }
      }

      // 每月1日 09:00 — 月度经营报告
      if (date === 1 && h === 9 && m === 0) {
        triggerNotification({ type: 'monthly_report', action: buildMonthlyReport() });
        // monthly_report 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'monthly_report', action: buildMonthlyReportForStore(s.id), storeId: s.id });
        }
      }

      // 每日 09:00 — 待处理事项提醒（MANAGER 不收）
      if (h === 9 && m === 0) {
        // ADMIN 收所有店铺的汇总
        triggerNotification({ type: 'review_reminder', action: buildReviewReminder() });
        // review_reminder 只发给 STORE_ADMIN（MANAGER 不收）
        for (const s of stores) {
          triggerNotification({ type: 'review_reminder', action: buildReviewReminderForStore(s.id), storeId: s.id });
        }
      }
    } catch (err) {
      logger.error('[Cron] setupCron interval error:', err);
    }
  }, 60000);
}
