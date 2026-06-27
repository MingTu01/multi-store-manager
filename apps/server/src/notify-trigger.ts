import db from './db.js';
import { ROLES } from './lib/roles.js';
import { sendNotification } from './notify.js';
import { sendPushNotification } from './push-notify.js';
import { eventBus } from './event-bus.js';

type NotifyType = 'entry' | 'payroll' | 'dividend' | 'inventory' | 'shift' | 'health_cert' | 'staff' | 'store' | 'purchase';

interface NotifyParams {
  type: NotifyType;
  action: string;
  storeId?: string;
  detail?: string;
  targetUserId?: number;
}

function getNotifyTitle(type: NotifyType): string {
  const titles: Record<string, string> = {
    entry: '\u8bb0\u8d26\u901a\u77e5',
    payroll: '\u5de5\u8d44\u901a\u77e5',
    dividend: '\u5206\u7ea2\u901a\u77e5',
    inventory: '\u76d8\u70b9\u901a\u77e5',
    shift: '\u5f00\u95ed\u5e97\u901a\u77e5',
    health_cert: '\u5065\u5eb7\u8bc1\u901a\u77e5',
    staff: '\u5458\u5de5\u901a\u77e5',
    store: '\u95e8\u5e97\u901a\u77e5',
    purchase: '\u8fdb\u8d27\u901a\u77e5',
  };
  return titles[type] || '\u7cfb\u7edf\u901a\u77e5';
}

function getTargetUsers(type: NotifyType, storeId?: string, targetUserId?: number): number[] {
  if (targetUserId) return [targetUserId];

  const userIds: number[] = [];
  const admins = db.prepare('SELECT id FROM users WHERE role = ?').all(ROLES.ADMIN) as any[];
  admins.forEach((u: any) => userIds.push(u.id));

  if (storeId) {
    if (type === 'entry' || type === 'inventory' || type === 'shift' || type === 'purchase') {
      const managers = db.prepare('SELECT id FROM users WHERE store_id = ? AND role = ?').all(storeId, ROLES.MANAGER) as any[];
      managers.forEach((u: any) => userIds.push(u.id));
    }
    if (type === 'payroll') {
      const staff = db.prepare("SELECT id FROM users WHERE store_id = ?").all(storeId) as any[];
      staff.forEach((u: any) => userIds.push(u.id));
    }
    if (type === 'dividend') {
      const shareholders = db.prepare('SELECT id FROM users WHERE store_id = ? AND role = ?').all(storeId, ROLES.SHAREHOLDER) as any[];
      shareholders.forEach((u: any) => userIds.push(u.id));
    }
  }

  return [...new Set(userIds)];
}

export function triggerNotification(params: NotifyParams): void {
  try {
    const { type, action, storeId, detail, targetUserId, operatorName } = params;
    const title = getNotifyTitle(type);
    const operator = operatorName ? '[' + operatorName + '] ' : '';
    const content = operator + action + (detail ? ': ' + detail : '');
    const targets = getTargetUsers(type, storeId, targetUserId);
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ').slice(0, 19);

    const stmt = db.prepare('INSERT INTO notifications (user_id, title, content, type, store_id, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)');
    for (const uid of targets) {
      stmt.run(uid, title, content, type, storeId || '', '/notifications', now);
    }
    // External push (fire and forget)
    sendNotification(title, content, type).catch(() => {});
    // Browser Web Push (fire and forget)
    for (const uid of targets) {
      sendPushNotification(uid, title, content).catch(() => {});
    }
    // SSE: broadcast notification update event for real-time badge refresh
    if (targets.length > 0) {
      eventBus.broadcast({
        type: 'notification',
        action: 'new',
        storeId,
        data: { type, count: targets.length },
      });
    }
  } catch (e) {
    console.error('triggerNotification error:', e);
  }
}