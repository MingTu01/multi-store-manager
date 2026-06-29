import db from './db.js';
import { ROLES } from './lib/roles.js';
import { sendNotification, getUserPushSettings } from './notify.js';
import { sendPushNotification } from './push-notify.js';
import { eventBus } from './event-bus.js';
import logger from './logger.js';

type NotifyType = 'entry' | 'payroll' | 'dividend' | 'inventory' | 'shift' | 'health_cert' | 'staff' | 'store' | 'purchase' | 'salary_confirm' | 'staff_change' | 'inventory_alert' | 'store_alert';

interface NotifyParams {
  type: NotifyType;
  action: string;
  storeId?: string;
  detail?: string;
  targetUserId?: number;
  operatorName?: string;
}

// 带指数退避的重试机制
async function withRetry(fn: () => Promise<void>, name: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try { await fn(); return; } catch (e) {
      logger.error(`[Notify] ${name} failed (attempt ${i + 1}/${maxRetries}):`, (e as Error).message);
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
  logger.error(`[Notify] ${name} failed after ${maxRetries} attempts, giving up.`);
}

function getNotifyTitle(type: NotifyType): string {
  const titles: Record<string, string> = {
    entry: '记账通知',
    payroll: '工资通知',
    dividend: '分红通知',
    inventory: '盘点通知',
    shift: '开闭店通知',
    health_cert: '健康证通知',
    staff: '员工通知',
    store: '门店通知',
    purchase: '进货通知',
    salary_confirm: '工资确认',
    staff_change: '人员变动',
    inventory_alert: '库存预警',
    store_alert: '门店预警',
  };
  return titles[type] || '系统通知';
}

function getTargetUsers(type: NotifyType, storeId?: string, targetUserId?: number): number[] {
  if (targetUserId) return [targetUserId];

  const userIds: number[] = [];
  const admins = db.prepare('SELECT id FROM users WHERE role = ?').all(ROLES.ADMIN) as any[];
  admins.forEach((u: any) => userIds.push(u.id));

  if (storeId) {
    if (type === 'entry' || type === 'inventory' || type === 'shift' || type === 'purchase') {
      const storeAdmins = db.prepare('SELECT id FROM users WHERE store_id = ? AND role IN (?, ?)').all(storeId, ROLES.STORE_ADMIN, ROLES.MANAGER) as any[];
      storeAdmins.forEach((u: any) => userIds.push(u.id));
    }

    if (type === 'dividend') {
      const shareholders = db.prepare('SELECT id FROM users WHERE store_id = ? AND role = ?').all(storeId, ROLES.SHAREHOLDER) as any[];
      shareholders.forEach((u: any) => userIds.push(u.id));
    }
  }

  if (type === 'payroll') {
    const staffs = db.prepare('SELECT id FROM users WHERE role = ? AND status = ?').all(ROLES.STAFF, 'active') as any[];
    staffs.forEach((u: any) => userIds.push(u.id));
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

    // Generate link based on notification type
    const linkMap: Record<string, string> = {
      entry: storeId ? '/store/' + storeId + '/entries' : '/entries',
      payroll: storeId ? '/store/' + storeId + '/payroll' : '/payroll',
      dividend: storeId ? '/store/' + storeId + '/dividends' : '/dividends',
      inventory: storeId ? '/store/' + storeId + '/inventory' : '/inventory',
      shift: storeId ? '/store/' + storeId + '/open-close' : '/open-close',
      health_cert: storeId ? '/store/' + storeId + '/staff' : '/staff',
      staff: storeId ? '/store/' + storeId + '/staff' : '/staff',
      store: '/stores',
      purchase: storeId ? '/store/' + storeId + '/purchase' : '/purchase',
      salary_confirm: storeId ? '/store/' + storeId + '/payroll' : '/payroll',
      staff_change: storeId ? '/store/' + storeId + '/staff' : '/staff',
      inventory_alert: storeId ? '/store/' + storeId + '/inventory' : '/inventory',
      store_alert: '/stores',
    };
    const link = linkMap[type] || '/notifications';

    const stmt = db.prepare('INSERT INTO notifications (user_id, title, content, type, store_id, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)');
    for (const uid of targets) {
      stmt.run(uid, title, content, type, storeId || '', link, now);
    }
    // External push (with retry) — 优先用户个人推送设置，无个人设置则用全局兜底
    let globalPushSent = false;
    for (const uid of targets) {
      const userSettings = getUserPushSettings(uid);
      if (userSettings && (userSettings.pushplus_token || userSettings.wecom_secret || userSettings.iyuu_token)) {
        withRetry(() => sendNotification(title, content, type, userSettings), 'sendNotification-user-' + uid).catch(e => {
          logger.error('[Notify] sendNotification failed: ' + e.message);
        });
      } else if (!globalPushSent) {
        withRetry(() => sendNotification(title, content, type), 'sendNotification-global').catch(e => {
          logger.error('[Notify] sendNotification failed: ' + e.message);
        });
        globalPushSent = true;
      }
    }
    // Browser Web Push (with retry)
    for (const uid of targets) {
      withRetry(() => sendPushNotification(uid, title, content, link), 'sendPushNotification-' + uid).catch(e => {
        logger.error('[Notify] sendPushNotification failed: ' + e.message);
      });
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
    logger.error('triggerNotification error:', e);
  }
}
