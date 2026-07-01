import crypto from 'crypto';
import db from './db.js';
import { formatMoney } from './lib/utils.js';
import { ROLES } from './lib/roles.js';
import { validateWebhookUrlAsync } from './lib/network.js';
import { existsSync, readFileSync, writeFileSync as wf, mkdirSync as md } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..');

// ── Token 加密 (AES-256-GCM) ──
const ENC_ALGO = 'aes-256-gcm';
let _encKey: Buffer | null = null;
function getEncKey(): Buffer {
  if (_encKey) return _encKey;
  if (process.env.NOTIFY_ENC_KEY) {
    _encKey = crypto.createHash('sha256').update(process.env.NOTIFY_ENC_KEY).digest();
    return _encKey;
  }
  const keyFile = join(BASE_DIR, 'data', 'notify-enc-key');
  try {
    if (existsSync(keyFile)) {
      const key = readFileSync(keyFile, 'utf-8').trim();
      if (key) { _encKey = Buffer.from(key, 'hex'); return _encKey; }
    }
  } catch (e) {
    logger.error('[NOTIFY] Failed to read encryption key file:', e);
  }
  const newKey = crypto.randomBytes(32);
  try {
    md(join(BASE_DIR, 'data'), { recursive: true });
    wf(keyFile, newKey.toString('hex'), { encoding: 'utf-8', mode: 0o600 });
    logger.info('[NOTIFY] Generated new notify encryption key');
  } catch (e) {
    logger.error('[NOTIFY] Failed to save notify encryption key:', e);
  }
  _encKey = newKey;
  return _encKey;
}

export function encryptToken(plain: string): string {
  if (!plain) return '';
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + tag.toString('base64') + ':' + enc.toString('base64');
}

export function decryptToken(enc: string): string {
  if (!enc || !enc.includes(':')) return enc || '';
  try {
    const parts = enc.split(':');
    if (parts.length !== 3) return enc || '';
    const key = getEncKey();
    const iv = Buffer.from(parts[0], 'base64');
    const tag = Buffer.from(parts[1], 'base64');
    const data = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv(ENC_ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch (e) {
    logger.warn('[Notify] Token decryption failed, key may have changed');
    return '';
  }
}

// ── 全局设置（返回解密后的明文） ──
export function getSettings(): any {
  const row = db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() as any || {};
  if (row.pushplus_token) row.pushplus_token = decryptToken(row.pushplus_token);
  if (row.wecom_secret) row.wecom_secret = decryptToken(row.wecom_secret);
  if (row.iyuu_token) row.iyuu_token = decryptToken(row.iyuu_token);
  return row;
}

// ── 角色可接收的推送类型 ──
// MANAGER 只收日报，不收周报/月报/待处理提醒
const ROLE_ALLOWED_TYPES: Record<string, string[]> = {
  ADMIN: ['daily_report','weekly_report','monthly_report','review_reminder','alert','inventory_alert','store_alert','entry','inventory','shift','payroll','dividend','health_cert','staff','store','purchase','salary_confirm'],
  STORE_ADMIN: ['daily_report','weekly_report','monthly_report','review_reminder','alert','inventory_alert','entry','inventory','shift','purchase','salary_confirm','health_cert','staff','store'],
  MANAGER: ['daily_report','entry','inventory','shift','purchase','health_cert','staff','store'],
  STAFF: ['payroll','salary_confirm'],
  SHAREHOLDER: ['dividend'],
};

export function isContentTypeAllowed(role: string, contentType: string): boolean {
  const allowed = ROLE_ALLOWED_TYPES[role?.toUpperCase()] || [];
  return allowed.includes(contentType);
}

// ── 推送频率限制 ──
const testRateLimit = new Map<string, number>();
// Cleanup expired entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 600000;
  for (const [k, v] of testRateLimit) {
    if (v < cutoff) testRateLimit.delete(k);
  }
}, 600000);
export function checkTestRateLimit(userId: number): string | null {
  const key = 'test_' + userId;
  const last = testRateLimit.get(key) || 0;
  if (Date.now() - last < 60000) return '测试推送频率限制，请60秒后再试';
  testRateLimit.set(key, Date.now());
  return null;
}

// ── 读取用户推送设置（解密） ──
export function getUserPushSettings(userId: number): any {
  const row = db.prepare('SELECT * FROM user_notification_settings WHERE user_id = ?').get(userId) as any;
  if (!row) return null;
  return {
    ...row,
    pushplus_token: decryptToken(row.pushplus_token || ''),
    wecom_secret: decryptToken(row.wecom_secret || ''),
    iyuu_token: decryptToken(row.iyuu_token || ''),
  };
}

// ── 渠道发送函数（支持用户设置） ──
export async function sendPushPlus(title: string, content: string, htmlContent: string, s: any): Promise<void> {
  if (!s.pushplus_token) throw new Error('PushPlus Token 未配置');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch('https://www.pushplus.plus/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s.pushplus_token, title, content: htmlContent || content, template: htmlContent ? 'html' : 'txt' }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const data = await res.json() as any;
  if (data.code !== 200) throw new Error('PushPlus: ' + (data.msg || '发送失败'));
}



export async function sendWeCom(title: string, content: string, s: any): Promise<void> {
  if (!s.wecom_corpid || !s.wecom_agentid || !s.wecom_secret) throw new Error('企业微信配置不完整');
  const proxyUrl = (s.wecom_proxy_url || 'https://wx.908521.xyz/').replace(/\/?$/, '/');
  const urlCheck = await validateWebhookUrlAsync(proxyUrl);
  if (!urlCheck.valid) throw new Error('代理URL不安全: ' + urlCheck.error);
  const controller1 = new AbortController();
  const timeout1 = setTimeout(() => controller1.abort(), 10000);
  let tokenRes;
  try {
    tokenRes = await fetch(proxyUrl + 'cgi-bin/gettoken?corpid=' + s.wecom_corpid + '&corpsecret=' + s.wecom_secret, { signal: controller1.signal });
  } finally {
    clearTimeout(timeout1);
  }
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) throw new Error('企业微信获取token失败: ' + (tokenData.errmsg || '请检查配置'));
  const accessToken = tokenData.access_token;
  const msgBody = {
    touser: s.wecom_userid || '@all',
    msgtype: 'text',
    agentid: parseInt(s.wecom_agentid),
    text: { content: title + '\n\n' + content }
  };
  const controller2 = new AbortController();
  const timeout2 = setTimeout(() => controller2.abort(), 10000);
  let sendRes;
  try {
    sendRes = await fetch(proxyUrl + 'cgi-bin/message/send?access_token=' + accessToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgBody),
      signal: controller2.signal
    });
  } finally {
    clearTimeout(timeout2);
  }
  const sendData = await sendRes.json() as any;
  if (sendData.errcode !== 0) throw new Error('企业微信发送失败: ' + (sendData.errmsg || '错误码' + sendData.errcode));
}

export async function sendIyuu(title: string, content: string, s: any): Promise<void> {
  if (!s.iyuu_token) throw new Error('爱语飞飞 Token 未配置');
  const params = new URLSearchParams({ text: title, desp: content });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let res;
  try {
    res = await fetch('https://iyuu.cn/' + s.iyuu_token + '.send?' + params.toString(), {
      method: 'GET',
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    if (data.errcode !== 0) throw new Error(data.errmsg || '发送失败');
  } catch (e: any) {
    if (e.message.includes('发送失败')) throw e;
    throw new Error('爱语飞飞返回: ' + text.substring(0, 200));
  }
}

// ── 旧接口兼容（全局设置发送） ──
export async function sendNotification(title: string, content: string, type?: string, settingsOverride?: any): Promise<void> {
  const s = settingsOverride || getSettings();
  const results: string[] = [];
  const errors: string[] = [];
  const sendOne = async (key: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(key); } catch (e: any) { errors.push(key + ': ' + e.message); }
  };
  if (s.pushplus_token) await sendOne('PushPlus', () => sendPushPlus(title, content, '', s));
  if (s.wecom_corpid && s.wecom_agentid && s.wecom_secret) await sendOne('企业微信', () => sendWeCom(title, content, s));
  if (s.iyuu_token) await sendOne('爱语飞飞', () => sendIyuu(title, content, s));
  if (results.length === 0 && errors.length === 0) throw new Error('未配置任何推送渠道');
  if (errors.length > 0 && results.length === 0) throw new Error('推送失败: ' + errors.join('; '));
}

// ── 旧接口：店铺级发送 ──
export async function sendStoreNotification(storeId: string, title: string, content: string, settings?: any, testChannel?: string): Promise<{results: string[], errors: string[]}> {
  const s = settings || {};
  const results: string[] = [];
  const errors: string[] = [];
  const sendOne = async (key: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(key); } catch (e: any) { errors.push(key + ': ' + e.message); }
  };
  if (s.pushplus_token && (!testChannel || testChannel === 'pushplus')) await sendOne('PushPlus', () => sendPushPlus(title, content, '', s));
  if (s.wecom_corpid && (!testChannel || testChannel === 'wecom')) await sendOne('企业微信', () => sendWeCom(title, content, s));
  if (s.iyuu_token && (!testChannel || testChannel === 'iyuu')) await sendOne('爱语飞飞', () => sendIyuu(title, content, s));
  return { results, errors };
}

// ── 报表模板 ──
const LINE = '━━━━━━━━━━━━━━━━';
const SIGNATURE = '\n— 多店联营管理系统 · 自动发送';
function moneyStr(n: number): string { return '¥' + formatMoney(n); }
function pctStr(n: number): string { return n.toFixed(1) + '%'; }
function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

export function getStoreData(storeId: string) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  const today = todayStr();
  const month = today.slice(0, 7);
  const todayEntries = db.prepare('SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date = ? GROUP BY type').all(storeId, today) as any[];
  const monthEntries = db.prepare('SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date LIKE ? GROUP BY type').all(storeId, month + '%') as any[];
  let ti=0,te=0,mi=0,me=0;
  for (const e of todayEntries) { if (e.type==='收入') ti=e.total; else te=e.total; }
  for (const e of monthEntries) { if (e.type==='收入') mi=e.total; else me=e.total; }
  return { store, todayIncome: ti, todayExpense: te, monthIncome: mi, monthExpense: me };
}

function storeBlock(name: string, inc: number, exp: number): string {
  const p = inc - exp, m = inc > 0 ? (p/inc*100) : 0;
  return '▸ ' + name + '\n  收入 ' + moneyStr(inc) + '    支出 ' + moneyStr(exp) + '\n  利润 ' + moneyStr(p) + '    毛利率 ' + pctStr(m) + '\n';
}

function storeRowHtml(name: string, inc: number, exp: number): string {
  const p = inc - exp, m = inc > 0 ? (p/inc*100) : 0;
  return '<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600">'+name+'</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#059669;text-align:right">'+moneyStr(inc)+'</td><td style="padding:6px 12px;border-bottom:1px solid #eee;color:#e11d48;text-align:right">'+moneyStr(exp)+'</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">'+moneyStr(p)+'</td><td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">'+pctStr(m)+'</td></tr>\n';
}

function reportHtmlHeader(title: string, subtitle: string): string {
  return '<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:16px"><h2 style="color:#1e293b;margin:0 0 4px">'+title+'</h2><p style="color:#94a3b8;font-size:13px;margin:0 0 16px">'+subtitle+'</p>';
}
function reportHtmlTable(): string {
  return '<table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left">店铺</th><th style="padding:8px 12px;text-align:right">收入</th><th style="padding:8px 12px;text-align:right">支出</th><th style="padding:8px 12px;text-align:right">利润</th><th style="padding:8px 12px;text-align:right">毛利率</th></tr></thead><tbody>\n';
}
function reportHtmlFooter(ti: number, te: number): string {
  const p = ti-te, m = ti>0?(p/ti*100):0;
  return '</tbody></table><div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px"><strong>全店合计</strong>　收入 '+moneyStr(ti)+'　支出 '+moneyStr(te)+'　利润 '+moneyStr(p)+'　毛利率 '+pctStr(m)+'</div><p style="color:#94a3b8;font-size:12px;margin:12px 0 0;text-align:center">— 多店联营管理系统 · 自动发送</p></div>';
}


// 批量查询所有门店数据 - 解决 N+1 查询问题
export function getBatchStoreData(storeIds: string[]): Map<string, { todayIncome: number; todayExpense: number; monthIncome: number; monthExpense: number }> {
  const result = new Map<string, { todayIncome: number; todayExpense: number; monthIncome: number; monthExpense: number }>();
  
  if (storeIds.length === 0) return result;
  
  const today = todayStr();
  const month = today.slice(0, 7);
  const placeholders = storeIds.map(() => '?').join(',');
  
  // 一次查询所有门店的今日收入/支出
  const todayData = db.prepare(
    `SELECT store_id, type, COALESCE(SUM(amount), 0) as total 
     FROM entries 
     WHERE store_id IN (${placeholders}) AND date = ? 
     GROUP BY store_id, type`
  ).all(...storeIds, today) as any[];
  
  // 一次查询所有门店的本月收入/支出
  const monthData = db.prepare(
    `SELECT store_id, type, COALESCE(SUM(amount), 0) as total 
     FROM entries 
     WHERE store_id IN (${placeholders}) AND date LIKE ? 
     GROUP BY store_id, type`
  ).all(...storeIds, month + '%') as any[];
  
  // 初始化所有门店
  for (const id of storeIds) {
    result.set(id, { todayIncome: 0, todayExpense: 0, monthIncome: 0, monthExpense: 0 });
  }
  
  // 填充今日数据
  for (const row of todayData) {
    const store = result.get(row.store_id)!;
    if (row.type === '收入') store.todayIncome = row.total;
    else store.todayExpense = row.total;
  }
  
  // 填充本月数据
  for (const row of monthData) {
    const store = result.get(row.store_id)!;
    if (row.type === '收入') store.monthIncome = row.total;
    else store.monthExpense = row.total;
  }
  
  return result;
}

// 批量查询指定日期范围的 entries - 用于周报/月报
export function getBatchEntriesByDateRange(storeIds: string[], startDate: string, endDate: string): Map<string, { income: number; expense: number }> {
  const result = new Map<string, { income: number; expense: number }>();
  
  if (storeIds.length === 0) return result;
  
  const placeholders = storeIds.map(() => '?').join(',');
  const isMonthQuery = startDate.endsWith('%');
  
  let rows: any[];
  if (isMonthQuery) {
    rows = db.prepare(
      `SELECT store_id, type, COALESCE(SUM(amount), 0) as total 
       FROM entries 
       WHERE store_id IN (${placeholders}) AND date LIKE ? 
       GROUP BY store_id, type`
    ).all(...storeIds, startDate) as any[];
  } else {
    rows = db.prepare(
      `SELECT store_id, type, COALESCE(SUM(amount), 0) as total 
       FROM entries 
       WHERE store_id IN (${placeholders}) AND date >= ? AND date <= ? 
       GROUP BY store_id, type`
    ).all(...storeIds, startDate, endDate) as any[];
  }
  
  // 初始化所有门店
  for (const id of storeIds) {
    result.set(id, { income: 0, expense: 0 });
  }
  
  // 填充数据
  for (const row of rows) {
    const store = result.get(row.store_id)!;
    if (row.type === '收入') store.income = row.total;
    else store.expense = row.total;
  }
  
  return result;
}export function buildDailyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchStoreData(storeIds);
  let ti=0,te=0;
  let r = '◆ 每日经营简报\n' + LINE + '\n' + todayStr() + '\n\n';
  for (const s of stores) { 
    const d = batchData.get(s.id) || { todayIncome: 0, todayExpense: 0 }; 
    ti+=d.todayIncome; te+=d.todayExpense; 
    r += storeBlock(s.name, d.todayIncome, d.todayExpense); 
  }
  r += LINE + '\n★ 全店合计\n  收入 '+moneyStr(ti)+'    支出 '+moneyStr(te)+'\n  利润 '+moneyStr(ti-te)+'    毛利率 '+pctStr(ti>0?((ti-te)/ti*100):0)+'\n';
  r += SIGNATURE;
  return r;
}
export function buildDailyReportHtml(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchStoreData(storeIds);
  let ti=0,te=0;
  let h = reportHtmlHeader('每日经营简报', todayStr()) + reportHtmlTable();
  for (const s of stores) { 
    const d = batchData.get(s.id) || { todayIncome: 0, todayExpense: 0 }; 
    ti+=d.todayIncome; te+=d.todayExpense; 
    h += storeRowHtml(s.name, d.todayIncome, d.todayExpense); 
  }
  h += reportHtmlFooter(ti, te);
  return h;
}

export function buildWeeklyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate() - now.getDay() + 1);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const ss = ws.getFullYear() + '-' + String(ws.getMonth() + 1).padStart(2, '0') + '-' + String(ws.getDate()).padStart(2, '0');
  const es = we.getFullYear() + '-' + String(we.getMonth() + 1).padStart(2, '0') + '-' + String(we.getDate()).padStart(2, '0');
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchEntriesByDateRange(storeIds, ss, es);
  let ti=0,te=0;
  let r = '◆ 每周经营报告\n' + LINE + '\n' + ss + ' 至 ' + es + '\n\n';
  for (const s of stores) {
    const d = batchData.get(s.id) || { income: 0, expense: 0 };
    ti+=d.income; te+=d.expense; r += storeBlock(s.name, d.income, d.expense);
  }
  r += LINE + '\n★ 全店合计\n  收入 '+moneyStr(ti)+'    支出 '+moneyStr(te)+'\n  利润 '+moneyStr(ti-te)+'    毛利率 '+pctStr(ti>0?((ti-te)/ti*100):0)+'\n';
  r += SIGNATURE;
  return r;
}
export function buildWeeklyReportHtml(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate() - now.getDay() + 1);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const ss = ws.getFullYear() + '-' + String(ws.getMonth() + 1).padStart(2, '0') + '-' + String(ws.getDate()).padStart(2, '0');
  const es = we.getFullYear() + '-' + String(we.getMonth() + 1).padStart(2, '0') + '-' + String(we.getDate()).padStart(2, '0');
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchEntriesByDateRange(storeIds, ss, es);
  let ti=0,te=0;
  let h = reportHtmlHeader('每周经营报告', ss + ' 至 ' + es) + reportHtmlTable();
  for (const s of stores) {
    const d = batchData.get(s.id) || { income: 0, expense: 0 };
    ti+=d.income; te+=d.expense; h += storeRowHtml(s.name, d.income, d.expense);
  }
  h += reportHtmlFooter(ti, te);
  return h;
}

export function buildMonthlyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const ms = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const mname = now.getFullYear() + '年' + String(now.getMonth()+1).padStart(2,'0') + '月';
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchEntriesByDateRange(storeIds, ms+'%', '');
  let ti=0,te=0;
  let r = '◆ ' + mname + ' 月度经营报告\n' + LINE + '\n' + ms + '\n\n';
  for (const s of stores) {
    const d = batchData.get(s.id) || { income: 0, expense: 0 };
    ti+=d.income; te+=d.expense; r += storeBlock(s.name, d.income, d.expense);
  }
  r += LINE + '\n★ 全店合计\n  收入 '+moneyStr(ti)+'    支出 '+moneyStr(te)+'\n  利润 '+moneyStr(ti-te)+'    毛利率 '+pctStr(ti>0?((ti-te)/ti*100):0)+'\n';
  r += SIGNATURE;
  return r;
}
export function buildMonthlyReportHtml(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const ms = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const mname = now.getFullYear() + '年' + String(now.getMonth()+1).padStart(2,'0') + '月';
  const storeIds = stores.map(s => s.id);
  const batchData = getBatchEntriesByDateRange(storeIds, ms+'%', '');
  let ti=0,te=0;
  let h = reportHtmlHeader(mname + ' 月度经营报告', ms) + reportHtmlTable();
  for (const s of stores) {
    const d = batchData.get(s.id) || { income: 0, expense: 0 };
    ti+=d.income; te+=d.expense; h += storeRowHtml(s.name, d.income, d.expense);
  }
  h += reportHtmlFooter(ti, te);
  return h;
}

export function buildReviewReminder(): string {
  const p = (db.prepare("SELECT COUNT(*) as c FROM inventory_checks WHERE status='pending'").get() as any)?.c||0;
  const pw = (db.prepare("SELECT COUNT(*) as c FROM payroll WHERE status='draft'").get() as any)?.c||0;
  const pd = (db.prepare("SELECT COUNT(*) as c FROM dividends WHERE status='draft'").get() as any)?.c||0;
  let r = '◆ 待处理事项提醒\n' + LINE + '\n' + todayStr() + '\n\n';
  r += '▸ 待审核盘点    ' + p + ' 条\n▸ 待确认工资    ' + pw + ' 条\n▸ 待确认分红    ' + pd + ' 条\n';
  r += '\n合计 ' + (p+pw+pd) + ' 条待处理\n';
  if (p+pw+pd === 0) r += '✓ 暂无待处理事项\n';
  r += SIGNATURE;
  return r;
}

export function buildAlert(message: string): string {
  return '◆ 系统告警通知\n' + LINE + '\n' + todayStr() + '\n\n' + message + '\n' + SIGNATURE;
}

// ── 单店铺报表函数 ──
export function buildDailyReportForStore(storeId: string): string {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) return '';
  const d = getStoreData(storeId);
  let r = '◆ ' + store.name + ' 每日经营简报\n' + LINE + '\n' + todayStr() + '\n\n';
  r += storeBlock(store.name, d.todayIncome, d.todayExpense);
  r += LINE + '\n★ 合计\n  收入 '+moneyStr(d.todayIncome)+'    支出 '+moneyStr(d.todayExpense)+'\n  利润 '+moneyStr(d.todayIncome-d.todayExpense)+'    毛利率 '+pctStr(d.todayIncome>0?((d.todayIncome-d.todayExpense)/d.todayIncome*100):0)+'\n';
  r += SIGNATURE;
  return r;
}

export function buildWeeklyReportForStore(storeId: string): string {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) return '';
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate() - now.getDay() + 1);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const ss = ws.getFullYear() + '-' + String(ws.getMonth() + 1).padStart(2, '0') + '-' + String(ws.getDate()).padStart(2, '0');
  const es = we.getFullYear() + '-' + String(we.getMonth() + 1).padStart(2, '0') + '-' + String(we.getDate()).padStart(2, '0');
  const data = getBatchEntriesByDateRange([storeId], ss, es);
  const d = data.get(storeId) || { income: 0, expense: 0 };
  let r = '◆ ' + store.name + ' 每周经营报告\n' + LINE + '\n' + ss + ' 至 ' + es + '\n\n';
  r += storeBlock(store.name, d.income, d.expense);
  r += LINE + '\n★ 合计\n  收入 '+moneyStr(d.income)+'    支出 '+moneyStr(d.expense)+'\n  利润 '+moneyStr(d.income-d.expense)+'    毛利率 '+pctStr(d.income>0?((d.income-d.expense)/d.income*100):0)+'\n';
  r += SIGNATURE;
  return r;
}

export function buildMonthlyReportForStore(storeId: string): string {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) return '';
  const now = new Date();
  const ms = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
  const mname = now.getFullYear() + '年' + String(now.getMonth()+1).padStart(2,'0') + '月';
  const data = getBatchEntriesByDateRange([storeId], ms+'%', '');
  const d = data.get(storeId) || { income: 0, expense: 0 };
  let r = '◆ ' + store.name + ' ' + mname + ' 月度经营报告\n' + LINE + '\n' + ms + '\n\n';
  r += storeBlock(store.name, d.income, d.expense);
  r += LINE + '\n★ 合计\n  收入 '+moneyStr(d.income)+'    支出 '+moneyStr(d.expense)+'\n  利润 '+moneyStr(d.income-d.expense)+'    毛利率 '+pctStr(d.income>0?((d.income-d.expense)/d.income*100):0)+'\n';
  r += SIGNATURE;
  return r;
}

export function buildReviewReminderForStore(storeId: string): string {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  if (!store) return '';
  const p = (db.prepare("SELECT COUNT(*) as c FROM inventory_checks WHERE status='pending' AND store_id = ?").get(storeId) as any)?.c||0;
  const pw = (db.prepare("SELECT COUNT(*) as c FROM payroll WHERE status='draft' AND store_id = ?").get(storeId) as any)?.c||0;
  const pd = (db.prepare("SELECT COUNT(*) as c FROM dividends WHERE status='draft' AND store_id = ?").get(storeId) as any)?.c||0;
  let r = '◆ ' + store.name + ' 待处理事项提醒\n' + LINE + '\n' + todayStr() + '\n\n';
  r += '▸ 待审核盘点    ' + p + ' 条\n▸ 待确认工资    ' + pw + ' 条\n▸ 待确认分红    ' + pd + ' 条\n';
  r += '\n合计 ' + (p+pw+pd) + ' 条待处理\n';
  if (p+pw+pd === 0) r += '✓ 暂无待处理事项\n';
  r += SIGNATURE;
  return r;
}
