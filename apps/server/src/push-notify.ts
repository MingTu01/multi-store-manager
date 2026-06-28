import webpush from 'web-push';
import db from './db.js';
import logger from './logger.js';

// ==================== VAPID (Web Push) ====================

function getOrCreateVapidKeys(): { publicKey: string; privateKey: string } {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get() as any;
  if (!row) db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const pubRow = db.prepare("SELECT value FROM app_settings WHERE key='vapid_public_key'").get() as any;
  const privRow = db.prepare("SELECT value FROM app_settings WHERE key='vapid_private_key'").get() as any;
  if (pubRow && privRow) return { publicKey: pubRow.value, privateKey: privRow.value };
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('vapid_public_key', ?)").run(keys.publicKey);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('vapid_private_key', ?)").run(keys.privateKey);
  return keys;
}

let vapidKeys: { publicKey: string; privateKey: string };

export function initPush(): void {
  try {
    vapidKeys = getOrCreateVapidKeys();
    webpush.setVapidDetails('mailto:admin@msl.908521.xyz', vapidKeys.publicKey, vapidKeys.privateKey);
  } catch (e) { logger.error('[Push] VAPID init failed:', e); }
}

export function getVapidPublicKey(): string {
  if (!vapidKeys) initPush();
  return vapidKeys.publicKey;
}

// ==================== JPush 极光推送 ====================

export function getJPushConfig(): { appKey: string; masterSecret: string } {
  try {
    const ak = db.prepare("SELECT value FROM app_settings WHERE key='jpush_app_key'").get() as any;
    const ms = db.prepare("SELECT value FROM app_settings WHERE key='jpush_master_secret'").get() as any;
    return { appKey: ak?.value || '', masterSecret: ms?.value || '' };
  } catch { return { appKey: '', masterSecret: '' }; }
}

export function setJPushConfig(appKey: string, masterSecret: string): void {
  const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get() as any;
  if (!tbl) db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('jpush_app_key', ?)").run(appKey);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('jpush_master_secret', ?)").run(masterSecret);
}

async function sendJPush(registrationId: string, title: string, body: string, url?: string): Promise<boolean> {
  const cfg = getJPushConfig();
  if (!cfg.appKey || !cfg.masterSecret) {
    logger.warn('[JPush] Not configured');
    return false;
  }
  try {
    const auth = Buffer.from(cfg.appKey + ':' + cfg.masterSecret).toString('base64');
    const res = await fetch('https://api.jpush.cn/v3/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + auth,
      },
      body: JSON.stringify({
        platform: 'android',
        audience: { registration_id: [registrationId] },
        notification: {
          android: {
            alert: body,
            title: title,
            extras: { url: url || '/' },
          },
        },
        options: { time_to_live: 86400 },
      }),
    });
    const data = await res.json() as any;
    if (data.msg_id) {
      logger.info('[JPush] Sent ok, msg_id:', data.msg_id);
      return true;
    } else {
      logger.warn('[JPush] Failed:', JSON.stringify(data));
      return false;
    }
  } catch (e: any) {
    logger.error('[JPush] Error:', e.message);
    return false;
  }
}

// ==================== 订阅管理 ====================

export function saveSubscription(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string } }): void {
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)')
    .run(userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth);
}

export function removeSubscription(userId: number, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

export function getUserSubscriptions(userId: number): any[] {
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
}

// ==================== 统一推送发送 ====================

export async function sendPushNotification(userId: number, title: string, body: string, url?: string): Promise<void> {
  const subs = getUserSubscriptions(userId);
  if (subs.length === 0) return;

  for (const sub of subs) {
    // JPush 极光推送 (APP 原生)
    if (sub.endpoint && sub.endpoint.startsWith('jpush:')) {
      const regId = sub.endpoint.replace('jpush:', '');
      await sendJPush(regId, title, body, url);
      continue;
    }
    // Web Push
    try {
      const payload = JSON.stringify({ title, body, url: url || '/', icon: '/logo-192.png', badge: '/logo-64.png' });
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600 }
      );
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') logger.warn('[Push] Failed user' + userId + ':', e.message);
      if (e.statusCode === 410) removeSubscription(userId, sub.endpoint);
    }
  }
}
