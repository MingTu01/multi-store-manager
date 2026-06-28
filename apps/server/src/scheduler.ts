import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import db from './db.js';
import { sendNotification, getSettings, buildDailyReport, buildWeeklyReport, buildMonthlyReport, buildReviewReminder } from './notify.js';
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
export function setupCron() {
  // 确保 app_settings 表存在
  db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)");

  setInterval(() => {
    try {
      // 任务3: 数据库标记防止重复执行（1分钟内不重复）
      const lastRun = db.prepare("SELECT value FROM app_settings WHERE key='last_cron_run'").get() as any;
      if (lastRun && Date.now() - parseInt(lastRun.value) < 60000) return;
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('last_cron_run', ?)").run(Date.now().toString());

      const now = new Date();
      const h = now.getHours(), m = now.getMinutes(), day = now.getDay();

      if (h === 22 && m === 0) {
        const s = getSettings();
        if (s.push_daily_report) sendNotification('每日营业简报', buildDailyReport()).catch((e) => logger.error(e));
      }
      if (day === 1 && h === 9 && m === 0) {
        const s = getSettings();
        if (s.push_weekly_report) sendNotification('每周周报', buildWeeklyReport()).catch((e) => logger.error(e));
      }
      if (now.getDate() === 1 && h === 9 && m === 0) {
        const s = getSettings();
        if (s.push_monthly_report) sendNotification('月度报告', buildMonthlyReport()).catch((e) => logger.error(e));
      }
      if (h === 9 && m === 0) {
        const s = getSettings();
        if (s.push_review_reminder) sendNotification('待审核提醒', buildReviewReminder()).catch((e) => logger.error(e));
      }
    } catch (err) {
      logger.error('[Cron] setupCron interval error:', err);
    }
  }, 60000);
}
