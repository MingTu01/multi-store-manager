import db from './db.js';
import { formatMoney } from './lib/utils';

export function getSettings(): any {
  return db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() || {};
}

export function getStoreData(storeId: number) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayEntries = db.prepare(
    "SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date = ? GROUP BY type"
  ).all(storeId, today) as any[];
  const monthEntries = db.prepare(
    "SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date LIKE ? GROUP BY type"
  ).all(storeId, month + '%') as any[];

  let todayIncome = 0, todayExpense = 0, monthIncome = 0, monthExpense = 0;
  for (const e of todayEntries) {
    if (e.type === '收入') todayIncome = e.total;
    else todayExpense = e.total;
  }
  for (const e of monthEntries) {
    if (e.type === '收入') monthIncome = e.total;
    else monthExpense = e.total;
  }

  return { store, todayIncome, todayExpense, monthIncome, monthExpense };
}

export async function sendPushPlus(title: string, content: string): Promise<void> {
  const s = getSettings();
  if (!s.pushplus_token) return;
  try {
    await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s.pushplus_token, title, content, template: 'txt' })
    });
  } catch (e) { console.error('PushPlus error:', e); }
}

export async function sendServerChan(title: string, content: string): Promise<void> {
  const s = getSettings();
  if (!s.serverchan_key) return;
  try {
    await fetch('https://sctapi.ftqq.com/' + s.serverchan_key + '.send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, desp: content })
    });
  } catch (e) { console.error('ServerChan error:', e); }
}

export async function sendWeCom(title: string, content: string): Promise<void> {
  const s = getSettings();
  if (!s.wecom_corpid || !s.wecom_agentid || !s.wecom_secret) return;
  try {
    const proxyUrl = (s.wecom_proxy_url || 'https://wx.908521.xyz').replace(/\/?$/, '/');
    const tokenRes = await fetch(proxyUrl + 'cgi-bin/gettoken?corpid=' + s.wecom_corpid + '&corpsecret=' + s.wecom_secret);
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) return;
    const accessToken = tokenData.access_token;
    await fetch(proxyUrl + 'cgi-bin/message/send?access_token=' + accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: s.wecom_userid || '@all',
        msgtype: 'text',
        agentid: parseInt(s.wecom_agentid),
        text: { content: title + '\n\n' + content }
      })
    });
  } catch (e) { console.error('WeCom error:', e); }
}

export async function sendNotification(title: string, content: string): Promise<void> {
  const s = getSettings();
  const method = s.method || 'none';
  if (method === 'pushplus') await sendPushPlus(title, content);
  else if (method === 'serverchan') await sendServerChan(title, content);
  else if (method === 'wecom') await sendWeCom(title, content);
}

export function buildDailyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  let report = '📊 每日营业简报\n';
  report += '──────────────────\n';
  report += '日期: ' + new Date().toISOString().slice(0, 10) + '\n\n';
  for (const store of stores) {
    const data = getStoreData(store.id);
    report += '🏪 ' + store.name + '\n';
    report += '今日收入: ¥' + formatMoney(data.todayIncome) + '\n';
    report += '今日支出: ¥' + formatMoney(data.todayExpense) + '\n';
    report += '今日利润: ¥' + formatMoney(data.todayIncome - data.todayExpense) + '\n';
    report += '──────────────────\n';
  }
  return report;
}

export function buildWeeklyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const startStr = weekStart.toISOString().slice(0, 10);
  const endStr = weekEnd.toISOString().slice(0, 10);

  let report = '📈 每周周报\n';
  report += '──────────────────\n';
  report += '周期: ' + startStr + ' ~ ' + endStr + '\n\n';
  for (const store of stores) {
    const entries = db.prepare(
      "SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date >= ? AND date <= ? GROUP BY type"
    ).all(store.id, startStr, endStr) as any[];
    let income = 0, expense = 0;
    for (const e of entries) {
      if (e.type === '收入') income = e.total;
      else expense = e.total;
    }
    report += '🏪 ' + store.name + '\n';
    report += '总收入: ¥' + formatMoney(income) + '\n';
    report += '总支出: ¥' + formatMoney(expense) + '\n';
    report += '净利润: ¥' + formatMoney(income - expense) + '\n';
    report += '──────────────────\n';
  }
  return report;
}

export function buildMonthlyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthStr = lastMonth.toISOString().slice(0, 7);

  let report = '📅 月度报告\n';
  report += '──────────────────\n';
  report += '月份: ' + monthStr + '\n\n';
  for (const store of stores) {
    const entries = db.prepare(
      "SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date LIKE ? GROUP BY type"
    ).all(store.id, monthStr + '%') as any[];
    let income = 0, expense = 0;
    for (const e of entries) {
      if (e.type === '收入') income = e.total;
      else expense = e.total;
    }
    report += '🏪 ' + store.name + '\n';
    report += '总收入: ¥' + formatMoney(income) + '\n';
    report += '总支出: ¥' + formatMoney(expense) + '\n';
    report += '净利润: ¥' + formatMoney(income - expense) + '\n';
    report += '──────────────────\n';
  }
  return report;
}

export function buildReviewReminder(): string {
  const pending = db.prepare(
    "SELECT COUNT(*) as count FROM inventory_checks WHERE status = 'pending'"
  ).get() as any;
  const draftPayroll = db.prepare(
    "SELECT COUNT(*) as count FROM payroll WHERE status = 'draft'"
  ).get() as any;

  let report = '🔔 待审核提醒\n';
  report += '──────────────────\n';
  report += '待审核盘点: ' + (pending?.count || 0) + ' 条\n';
  report += '待确认工资: ' + (draftPayroll?.count || 0) + ' 条\n';
  report += '──────────────────\n';
  return report;
}

export function buildAlert(message: string): string {
  let report = '⚠️ 系统告警\n';
  report += '──────────────────\n';
  report += message + '\n';
  report += '──────────────────\n';
  return report;
}
