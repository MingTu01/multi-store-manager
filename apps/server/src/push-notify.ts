import webpush from 'web-push';
import db from './db.js';
import crypto from 'crypto';
import logger from './logger.js';

// VAPID 密钥管理

function getOrCreateVapidKeys(): { publicKey: string; privateKey: string } {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings'").get() as any;
  if (!row) {
    db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  }
  const pubRow = db.prepare("SELECT value FROM app_settings WHERE key='vapid_public_key'").get() as any;
  const privRow = db.prepare("SELECT value FROM app_settings WHERE key='vapid_private_key'").get() as any;

  if (pubRow && privRow) {
    return { publicKey: pubRow.value, privateKey: privRow.value };
  }

  // 生成新密钥对
  const keys = webpush.generateVAPIDKeys();
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('vapid_public_key', ?)").run(keys.publicKey);
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('vapid_private_key', ?)").run(keys.privateKey);
  if (process.env.NODE_ENV !== 'production') logger.info('[Push] Generated new VAPID keys');
  return keys;
}

let vapidKeys: { publicKey: string; privateKey: string };

export function initPush(): void {
  try {
    vapidKeys = getOrCreateVapidKeys();
    webpush.setVapidDetails('mailto:admin@msl.908521.xyz', vapidKeys.publicKey, vapidKeys.privateKey);
  } catch (e) {
    logger.error('[Push] Failed to initialize VAPID:', e);
  }
}

export function getVapidPublicKey(): string {
  if (!vapidKeys) initPush();
  return vapidKeys.publicKey;
}

// 订阅管理
export function saveSubscription(userId: number, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): void {
  db.prepare('INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)')
    .run(userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
}

export function removeSubscription(userId: number, endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(userId, endpoint);
}

export function getUserSubscriptions(userId: number): any[] {
  return db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);
}

// 推送发送
export async function sendPushNotification(userId: number, title: string, body: string, url?: string): Promise<void> {
  const subs = getUserSubscriptions(userId);
  if (subs.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url || '/', icon: '/logo-192.png', badge: '/logo-64.png' });

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 3600 }
      );
    } catch (e: any) {
      if (process.env.NODE_ENV !== 'production') logger.warn('[Push] Failed to send to user' + userId + ':', e.message);
      // 如果订阅失效（410 Gone），删除它
      if (e.statusCode === 410) {
        removeSubscription(userId, sub.endpoint);
      }
    }
  }
}
