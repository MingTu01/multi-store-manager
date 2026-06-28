// DEPRECATED: 此模块已被 index.ts 中的 setupCron() 替代，不再使用。
// 如需定时报表推送，请使用 index.ts 的 setupCron 函数。
// 此文件保留仅供参考，可安全删除。

import db from './db.js';
import { ROLES } from './lib/roles.js';
import { buildDailyReport, buildWeeklyReport, buildMonthlyReport, sendNotification } from './notify.js';
import logger from './logger.js';

function getBeijingDate() {
  const now = new Date();
  const local = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  return { hour: local.getHours(), day: local.getDate(), weekday: local.getDay(), dateStr: local.getFullYear() + '-' + String(local.getMonth() + 1).padStart(2, '0') + '-' + String(local.getDate()).padStart(2, '0') };
}

let lastDaily = '', lastWeekly = '', lastMonthly = '';

function pushAdmins(title: string, content: string) {
  const admins = db.prepare('SELECT id FROM users WHERE role = ?').all(ROLES.ADMIN) as any[];
  const stmt = db.prepare("INSERT INTO notifications (user_id, title, content, type, read, created_at) VALUES (?,?,?,?,0,datetime('now','localtime'))");
  for (const a of admins) stmt.run(a.id, title, content, 'report');
  // sendNotification handled by notification-trigger.ts
}

export function startReportScheduler() {
  logger.info('[报表推送] 定时报表已启动');

  const checkAndPush = () => {
    const { hour, day, weekday, dateStr } = getBeijingDate();
    if (hour === 21 && lastDaily !== dateStr) { lastDaily = dateStr; pushAdmins('每日经营简报', buildDailyReport()); logger.info('[报表推送] 每日简报已发送'); }
    if (weekday === 1 && hour === 21 && lastWeekly !== dateStr) { lastWeekly = dateStr; pushAdmins('每周经营报告', buildWeeklyReport()); logger.info('[报表推送] 每周报告已发送'); }
    if (day === 1 && hour === 21 && lastMonthly !== dateStr) { lastMonthly = dateStr; pushAdmins('月度经营报告', buildMonthlyReport()); logger.info('[报表推送] 月度报告已发送'); }
  };

  // 启动时立即检查一次，避免等到第一个 interval
  checkAndPush();
  setInterval(checkAndPush, 60000);
}