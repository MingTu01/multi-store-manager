import db from './db.js';
import { ROLES } from './lib/roles.js';
import { buildDailyReport, buildDailyReportHtml, buildWeeklyReport, buildWeeklyReportHtml, buildMonthlyReport, buildMonthlyReportHtml } from './notify.js';
import { pushReportToUsers } from './notify-trigger.js';

function getBeijingDate() {
  const now = new Date();
  const local = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
  const lastDay = new Date(local.getFullYear(), local.getMonth() + 1, 0).getDate();
  return {
    hour: local.getHours(),
    day: local.getDate(),
    weekday: local.getDay(), // 0=Sun
    dateStr: local.toISOString().slice(0, 10),
    lastDay,
  };
}

let lastDaily = '', lastWeekly = '', lastMonthly = '';

export function startReportScheduler() {
  console.log('[报表推送] 定时报表已启动');

  const checkAndPush = async () => {
    try {
      const { hour, day, weekday, dateStr, lastDay } = getBeijingDate();

      // 每日简报：每天 21:00
      if (hour === 21 && lastDaily !== dateStr) {
        lastDaily = dateStr;
        await pushReportToUsers('每日经营简报', buildDailyReport(), buildDailyReportHtml(), 'daily_report');
        console.log('[报表推送] 每日简报已发送');
      }

      // 每周报告：每周日 21:00 (weekday === 0)
      if (weekday === 0 && hour === 21 && lastWeekly !== dateStr) {
        lastWeekly = dateStr;
        await pushReportToUsers('每周经营报告', buildWeeklyReport(), buildWeeklyReportHtml(), 'weekly_report');
        console.log('[报表推送] 每周报告已发送');
      }

      // 月度报告：每月最后一天 21:00
      if (day === lastDay && hour === 21 && lastMonthly !== dateStr) {
        lastMonthly = dateStr;
        await pushReportToUsers('月度经营报告', buildMonthlyReport(), buildMonthlyReportHtml(), 'monthly_report');
        console.log('[报表推送] 月度报告已发送');
      }
    } catch (e) {
      console.error('[报表推送] 检查失败:', e);
    }
  };

  checkAndPush();
  setInterval(checkAndPush, 60000);
}
