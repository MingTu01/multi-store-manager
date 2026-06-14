import db from './db.js';
import { buildDailyReport, buildWeeklyReport, buildMonthlyReport, sendNotification } from './notify.js';

function getBeijingDate() {
  const now = new Date();
  const local = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  return { hour: local.getHours(), day: local.getDate(), weekday: local.getDay(), dateStr: local.toISOString().slice(0, 10) };
}

let lastDaily = '', lastWeekly = '', lastMonthly = '';

function pushAdmins(title: string, content: string) {
  const admins = db.prepare("SELECT id FROM users WHERE role IN ('admin','ADMIN')").all() as any[];
  const stmt = db.prepare("INSERT INTO notifications (user_id, title, content, type, read, created_at) VALUES (?,?,?,?,0,datetime('now','localtime'))");
  for (const a of admins) stmt.run(a.id, title, content, 'report');
  // sendNotification handled by notification-trigger.ts
}

export function startReportScheduler() {
  console.log('[报表推送] 定时报表已启动');
  setInterval(() => {
    const { hour, day, weekday, dateStr } = getBeijingDate();
    if (hour === 21 && lastDaily !== dateStr) { lastDaily = dateStr; pushAdmins('每日经营简报', buildDailyReport()); console.log('[报表推送] 每日简报已发送'); }
    if (weekday === 1 && hour === 21 && lastWeekly !== dateStr) { lastWeekly = dateStr; pushAdmins('每周经营报告', buildWeeklyReport()); console.log('[报表推送] 每周报告已发送'); }
    if (day === 1 && hour === 21 && lastMonthly !== dateStr) { lastMonthly = dateStr; pushAdmins('月度经营报告', buildMonthlyReport()); console.log('[报表推送] 月度报告已发送'); }
  }, 60000);
}
