import db from './db.js';
import { formatMoney } from './lib/utils.js';

export function getSettings(): any {
  return db.prepare('SELECT * FROM notification_settings WHERE id = 1').get() || {};
}

export function getStoreData(storeId: string) {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as any;
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayEntries = db.prepare(
    'SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date = ? GROUP BY type'
  ).all(storeId, today) as any[];
  const monthEntries = db.prepare(
    'SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date LIKE ? GROUP BY type'
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
  if (!s.pushplus_token) throw new Error('PushPlus Token 未配置');
  const res = await fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: s.pushplus_token, title, content, template: 'txt' })
  });
  const data = await res.json() as any;
  if (data.code !== 200) throw new Error('PushPlus: ' + (data.msg || '发送失败'));
}

export async function sendServerChan(title: string, content: string): Promise<void> {
  const s = getSettings();
  if (!s.serverchan_key) throw new Error('Server酱 Key 未配置');
  const res = await fetch('https://sctapi.ftqq.com/' + s.serverchan_key + '.send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, desp: content })
  });
  const data = await res.json() as any;
  if (data.code !== 0) throw new Error('Server酱: ' + (data.message || '发送失败'));
}

export async function sendWeCom(title: string, content: string): Promise<void> {
  const s = getSettings();
  if (!s.wecom_corpid || !s.wecom_agentid || !s.wecom_secret) throw new Error('企业微信配置不完整');
  const proxyUrl = (s.wecom_proxy_url || 'https://wx.908521.xyz/').replace(/\/?$/, '/');
  const tokenRes = await fetch(proxyUrl + 'cgi-bin/gettoken?corpid=' + s.wecom_corpid + '&corpsecret=' + s.wecom_secret);
  const tokenData = await tokenRes.json() as any;
  if (!tokenData.access_token) throw new Error('企业微信获取token失败: ' + (tokenData.errmsg || '请检查CorpID和Secret'));
  const accessToken = tokenData.access_token;
  const msgBody = {
    touser: s.wecom_userid || '@all',
    msgtype: 'text',
    agentid: parseInt(s.wecom_agentid),
    text: { content: title + '\n\n' + content }
  };
  const sendRes = await fetch(proxyUrl + 'cgi-bin/message/send?access_token=' + accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msgBody)
  });
  const sendData = await sendRes.json() as any;
  if (sendData.errcode !== 0) throw new Error('企业微信发送失败: ' + (sendData.errmsg || '错误码' + sendData.errcode));
}

export async function sendNotification(title: string, content: string, type?: string): Promise<void> {
  const s = getSettings();
  const method = s.method;
  const results: string[] = [];
  const errors: string[] = [];
  const sendOne = async (key: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(key); } catch (e: any) { errors.push(key + ': ' + e.message); }
  };
  if (method && method !== 'none') {
    if (method === 'pushplus') await sendOne('PushPlus', () => sendPushPlus(title, content));
    else if (method === 'serverchan') await sendOne('Server酱', () => sendServerChan(title, content));
    else if (method === 'wecom') await sendOne('企业微信', () => sendWeCom(title, content));
  } else {
    if (s.pushplus_token) await sendOne('PushPlus', () => sendPushPlus(title, content));
    if (s.serverchan_key) await sendOne('Server酱', () => sendServerChan(title, content));
    if (s.wecom_corpid && s.wecom_agentid && s.wecom_secret) await sendOne('企业微信', () => sendWeCom(title, content));
  }
  if (results.length === 0 && errors.length === 0) {
    throw new Error('未配置任何推送渠道，请先配置至少一个渠道');
  }
  if (errors.length > 0 && results.length === 0) {
    throw new Error('推送失败: ' + errors.join('; '));
  }
}


export async function sendStoreNotification(storeId: string, title: string, content: string, settings?: any): Promise<void> {
  const s = settings || {};
  const results: string[] = [];
  const errors: string[] = [];
  const sendOne = async (key: string, fn: () => Promise<void>) => {
    try { await fn(); results.push(key); } catch (e: any) { errors.push(key + ': ' + e.message); }
  };
  if (s.pushplus_token) await sendOne('PushPlus', async () => {
    const r = await fetch('https://www.pushplus.plus/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: s.pushplus_token, title, content, template: 'txt' })
    });
    const d = await r.json() as any;
    if (d.code !== 200) throw new Error(d.msg || 'fail');
  });
  if (s.serverchan_key) await sendOne('ServerChan', async () => {
    const r = await fetch('https://sctapi.ftqq.com/' + s.serverchan_key + '.send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, desp: content })
    });
    const d = await r.json() as any;
    if (d.code !== 0) throw new Error(d.message || 'fail');
  });
  if (s.wecom_corpid && s.wecom_agentid && s.wecom_secret) await sendOne('WeCom', async () => {
    const pUrl = (s.wecom_proxy_url || 'https://wx.908521.xyz/').replace(/\/?$/, '/');
    const tRes = await fetch(pUrl + 'cgi-bin/gettoken?corpid=' + s.wecom_corpid + '&corpsecret=' + s.wecom_secret);
    const tData = await tRes.json() as any;
    if (!tData.access_token) throw new Error('token failed: ' + (tData.errmsg || ''));
    const sRes = await fetch(pUrl + 'cgi-bin/message/send?access_token=' + tData.access_token, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ touser: s.wecom_userid || '@all', msgtype: 'text', agentid: parseInt(s.wecom_agentid), text: { content: title + '\n\n' + content } })
    });
    const sData = await sRes.json() as any;
    if (sData.errcode !== 0) throw new Error('send failed: ' + (sData.errmsg || sData.errcode));
  });
  if (results.length === 0 && errors.length === 0) throw new Error('未配置任何推送渠道');
  if (errors.length > 0 && results.length === 0) throw new Error('推送失败: ' + errors.join('; '));
}



function todayStr(): string {
  const now = new Date();
  const offset = 8 * 60;
  const local = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

function moneyStr(v: number): string {
  if (v >= 10000) return '\u00a5' + (v / 10000).toFixed(2) + '\u4e07';
  if (v <= -10000) return '-\u00a5' + (Math.abs(v) / 10000).toFixed(2) + '\u4e07';
  if (v < 0) return '-\u00a5' + Math.abs(v).toFixed(0);
  return '\u00a5' + v.toFixed(0);
}

function pctStr(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
}

const LINE = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';

function storeBlock(name: string, inc: number, exp: number): string {
  const profit = inc - exp;
  const margin = inc > 0 ? (profit / inc * 100) : 0;
  return '\u25b8 ' + name + '\n'
    + '  \u6536\u5165 ' + moneyStr(inc) + '    \u652f\u51fa ' + moneyStr(exp) + '\n'
    + '  \u5229\u6da6 ' + moneyStr(profit) + '    \u6bdb\u5229\u7387 ' + pctStr(margin) + '\n';
}

export function buildDailyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  let totalIncome = 0, totalExpense = 0;
  let r = '\u25c6 \u6bcf\u65e5\u7ecf\u8425\u7b80\u62a5\n';
  r += LINE + '\n';
  r += todayStr() + '\n\n';
  for (const store of stores) {
    const d = getStoreData(store.id);
    totalIncome += d.todayIncome;
    totalExpense += d.todayExpense;
    r += storeBlock(store.name, d.todayIncome, d.todayExpense) + '\n';
  }
  r += LINE + '\n';
  r += '\u2605 \u5168\u5e97\u5408\u8ba1\n';
  r += '  \u6536\u5165 ' + moneyStr(totalIncome) + '    \u652f\u51fa ' + moneyStr(totalExpense) + '\n';
  r += '  \u5229\u6da6 ' + moneyStr(totalIncome - totalExpense) + '    \u6bdb\u5229\u7387 ' + pctStr(totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0) + '\n';
  return r;
}

export function buildWeeklyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const ws = new Date(now); ws.setDate(now.getDate() - now.getDay() + 1);
  const we = new Date(ws); we.setDate(ws.getDate() + 6);
  const ss = ws.toISOString().slice(0, 10);
  const es = we.toISOString().slice(0, 10);
  let totalIncome = 0, totalExpense = 0;
  let r = '\u25c6 \u6bcf\u5468\u7ecf\u8425\u62a5\u544a\n';
  r += LINE + '\n';
  r += ss + ' \u81f3 ' + es + '\n\n';
  for (const store of stores) {
    const entries = db.prepare(
      'SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date >= ? AND date <= ? GROUP BY type'
    ).all(store.id, ss, es) as any[];
    let inc = 0, exp = 0;
    for (const e of entries) { if (e.type === '\u6536\u5165') inc = e.total; else exp = e.total; }
    totalIncome += inc; totalExpense += exp;
    r += storeBlock(store.name, inc, exp) + '\n';
  }
  r += LINE + '\n';
  r += '\u2605 \u5168\u5e97\u5408\u8ba1\n';
  r += '  \u6536\u5165 ' + moneyStr(totalIncome) + '    \u652f\u51fa ' + moneyStr(totalExpense) + '\n';
  r += '  \u5229\u6da6 ' + moneyStr(totalIncome - totalExpense) + '    \u6bdb\u5229\u7387 ' + pctStr(totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0) + '\n';
  return r;
}

export function buildMonthlyReport(): string {
  const stores = db.prepare('SELECT * FROM stores').all() as any[];
  const now = new Date();
  const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const ms = lm.toISOString().slice(0, 7);
  const mname = lm.getFullYear() + '\u5e74' + String(lm.getMonth() + 1).padStart(2, '0') + '\u6708';
  let totalIncome = 0, totalExpense = 0;
  let r = '\u25c6 ' + mname + ' \u6708\u5ea6\u7ecf\u8425\u62a5\u544a\n';
  r += LINE + '\n\n';
  for (const store of stores) {
    const entries = db.prepare(
      'SELECT type, SUM(amount) as total FROM entries WHERE store_id = ? AND date LIKE ? GROUP BY type'
    ).all(store.id, ms + '%') as any[];
    let inc = 0, exp = 0;
    for (const e of entries) { if (e.type === '\u6536\u5165') inc = e.total; else exp = e.total; }
    totalIncome += inc; totalExpense += exp;
    r += storeBlock(store.name, inc, exp) + '\n';
  }
  r += LINE + '\n';
  r += '\u2605 \u5168\u5e97\u5408\u8ba1\n';
  r += '  \u6536\u5165 ' + moneyStr(totalIncome) + '    \u652f\u51fa ' + moneyStr(totalExpense) + '\n';
  r += '  \u5229\u6da6 ' + moneyStr(totalIncome - totalExpense) + '    \u6bdb\u5229\u7387 ' + pctStr(totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome * 100) : 0) + '\n';
  return r;
}

export function buildReviewReminder(): string {
  const pending = db.prepare("SELECT COUNT(*) as c FROM inventory_checks WHERE status = 'pending'").get() as any;
  const draftPayroll = db.prepare("SELECT COUNT(*) as c FROM payroll WHERE status = 'draft'").get() as any;
  const draftDividend = db.prepare("SELECT COUNT(*) as c FROM dividends WHERE status = 'draft'").get() as any;
  let r = '\u25c6 \u5f85\u5904\u7406\u4e8b\u9879\u63d0\u9192\n';
  r += LINE + '\n\n';
  r += '\u25b8 \u5f85\u5ba1\u6838\u76d8\u70b9    ' + (pending?.c || 0) + ' \u6761\n';
  r += '\u25b8 \u5f85\u786e\u8ba4\u5de5\u8d44    ' + (draftPayroll?.c || 0) + ' \u6761\n';
  r += '\u25b8 \u5f85\u786e\u8ba4\u5206\u7ea2    ' + (draftDividend?.c || 0) + ' \u6761\n';
  if ((pending?.c || 0) + (draftPayroll?.c || 0) + (draftDividend?.c || 0) === 0) {
    r += '\n\u2713 \u6682\u65e0\u5f85\u5904\u7406\u4e8b\u9879\n';
  }
  return r;
}

export function buildAlert(message: string): string {
  let r = '\u25c6 \u7cfb\u7edf\u544a\u8b66\u901a\u77e5\n';
  r += LINE + '\n\n';
  r += message + '\n';
  return r;
}