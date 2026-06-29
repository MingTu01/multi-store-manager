import db from './db.js';
import { ROLES } from './lib/roles.js';
import { sendNotification, getUserPushSettings } from './notify.js';
import { sendPushNotification } from './push-notify.js';
import { eventBus } from './event-bus.js';
import logger from './logger.js';

type NotifyType = 'entry' | 'payroll' | 'dividend' | 'inventory' | 'shift' | 'health_cert' | 'staff' | 'store' | 'purchase' | 'salary_confirm' | 'staff_change' | 'inventory_alert' | 'store_alert' | 'daily_report' | 'weekly_report' | 'monthly_report' | 'review_reminder' | 'alert';

// 通知类型 → 用户推送开关字段名映射
const TYPE_TO_PUSH_FIELD: Record<string, string> = {
  entry: 'push_bookkeeping_notify',
  payroll: 'push_salary_notify',
  dividend: 'push_dividend_notify',
  inventory: 'push_inventory_notify',
  shift: 'push_openclose_notify',
  purchase: 'push_purchase_notify',
  health_cert: 'push_health_cert',
  staff: 'push_staff',
  store: 'push_store',
  salary_confirm: 'push_salary_confirm',
  staff_change: 'push_staff_change',
  inventory_alert: 'push_inventory_alert',
  store_alert: 'push_store_alert',
  daily_report: 'push_daily_report',
  weekly_report: 'push_weekly_report',
  monthly_report: 'push_monthly_report',
  review_reminder: 'push_review_reminder',
  alert: 'push_alert',
};

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
    daily_report: '每日经营简报',
    weekly_report: '每周经营报告',
    monthly_report: '月度经营报告',
    review_reminder: '待处理事项提醒',
    alert: '系统告警',
  };
  return titles[type] || '系统通知';
}

function getTargetUsers(type: NotifyType, storeId?: string, targetUserId?: number): number[] {
  if (targetUserId) return [targetUserId];

  const userIds: number[] = [];

  // 报表类通知：发给 ADMIN（全局）或店铺管理员（单店铺）
  if (type === 'daily_report' || type === 'weekly_report' || type === 'monthly_report' || type === 'review_reminder') {
    if (storeId) {
      // 单店铺报表：发给该店铺的管理员
      const storeAdmins = db.prepare('SELECT id FROM users WHERE store_id = ? AND role IN (?, ?) AND status = ?').all(storeId, ROLES.STORE_ADMIN, ROLES.MANAGER, 'active') as any[];
      storeAdmins.forEach((u: any) => userIds.push(u.id));
    } else {
      // 全局报表：发给所有 ADMIN
      const admins = db.prepare('SELECT id FROM users WHERE role = ? AND status = ?').all(ROLES.ADMIN, 'active') as any[];
      admins.forEach((u: any) => userIds.push(u.id));
    }
    return [...new Set(userIds)];
  }

  // 告警类通知：发给 ADMIN + 店铺管理员
  if (type === 'alert') {
    const admins = db.prepare('SELECT id FROM users WHERE role = ? AND status = ?').all(ROLES.ADMIN, 'active') as any[];
    admins.forEach((u: any) => userIds.push(u.id));
    return [...new Set(userIds)];
  }

  // 其他通知类型
  const admins = db.prepare('SELECT id FROM users WHERE role = ? AND status = ?').all(ROLES.ADMIN, 'active') as any[];
  admins.forEach((u: any) => userIds.push(u.id));

  if (storeId) {
    if (type === 'entry' || type === 'inventory' || type === 'shift' || type === 'purchase' || type === 'health_cert' || type === 'staff' || type === 'store' || type === 'salary_confirm' || type === 'staff_change' || type === 'inventory_alert' || type === 'store_alert') {
      const storeAdmins = db.prepare('SELECT id FROM users WHERE store_id = ? AND role IN (?, ?) AND status = ?').all(storeId, ROLES.STORE_ADMIN, ROLES.MANAGER, 'active') as any[];
      storeAdmins.forEach((u: any) => userIds.push(u.id));
    }

    if (type === 'dividend') {
      const shareholders = db.prepare('SELECT id FROM users WHERE store_id = ? AND role = ? AND status = ?').all(storeId, ROLES.SHAREHOLDER, 'active') as any[];
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
      daily_report: storeId ? '/store/' + storeId + '/entries' : '/dashboard',
      weekly_report: storeId ? '/store/' + storeId + '/entries' : '/dashboard',
      monthly_report: storeId ? '/store/' + storeId + '/entries' : '/dashboard',
      review_reminder: '/notifications',
      alert: '/notifications',
    };
    const link = linkMap[type] || '/notifications';

    const stmt = db.prepare('INSERT INTO notifications (user_id, title, content, type, store_id, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)');
    for (const uid of targets) {
      stmt.run(uid, title, content, type, storeId || '', link, now);
    }
    // External push: 检查用户开关 + 有个人渠道才发，无个人渠道跳过
    const pushField = TYPE_TO_PUSH_FIELD[type];
    for (const uid of targets) {
      const userSettings = getUserPushSettings(uid);
      if (!userSettings) continue; // 无个人设置，跳过
      // 检查用户的推送开关（默认开启）
      if (pushField && userSettings[pushField] === 0) continue; // 用户关闭了该类型推送
      // 有个人渠道才发
      if (userSettings.pushplus_token || userSettings.wecom_secret || userSettings.iyuu_token) {
        withRetry(() => sendNotification(title, content, type, userSettings), 'sendNotification-user-' + uid).catch(e => {
          logger.error('[Notify] sendNotification failed: ' + e.message);
        });
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
