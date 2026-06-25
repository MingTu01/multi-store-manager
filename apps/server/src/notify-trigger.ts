import db from './db.js';
import { ROLES } from './lib/roles.js';
import { sendToUser, isContentTypeAllowed } from './notify.js';
import { sendPushNotification } from './push-notify.js';

type NotifyType = 'entry' | 'payroll' | 'dividend' | 'inventory' | 'shift' | 'health_cert' | 'staff' | 'store' | 'purchase' | 'report';

interface NotifyParams {
  type: NotifyType;
  action: string;
  storeId?: string;
  detail?: string;
  targetUserId?: number;
  operatorName?: string;
}

const TYPE_TITLES: Record<string, string> = {
  entry: '记账通知', payroll: '工资通知', dividend: '分红通知',
  inventory: '盘点通知', shift: '开闭店通知', health_cert: '健康证通知',
  staff: '员工通知', store: '门店通知', purchase: '进货通知', report: '报表通知',
};

function getTargetUsers(type: NotifyType, storeId?: string, targetUserId?: number): number[] {
  if (targetUserId) return [targetUserId];
  const userIds: number[] = [];
  // 管理员总是收到
  const admins = db.prepare('SELECT id FROM users WHERE role = ?').all(ROLES.ADMIN) as any[];
  admins.forEach((u: any) => userIds.push(u.id));
  if (storeId) {
    if (type === 'entry' || type === 'inventory' || type === 'shift' || type === 'purchase') {
      const managers = db.prepare('SELECT id FROM users WHERE store_id = ? AND role = ?').all(storeId, ROLES.MANAGER) as any[];
      managers.forEach((u: any) => userIds.push(u.id));
    }
    if (type === 'payroll') {
      const staff = db.prepare('SELECT id FROM users WHERE store_id = ?').all(storeId) as any[];
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
    const title = TYPE_TITLES[type] || '系统通知';
    const operator = operatorName ? '[' + operatorName + '] ' : '';
    const content = operator + action + (detail ? ': ' + detail : '');
    const targets = getTargetUsers(type, storeId, targetUserId);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 写入站内通知
    const stmt = db.prepare('INSERT INTO notifications (user_id, title, content, type, store_id, link, read, created_at) VALUES (?,?,?,?,?,?,0,?)');
    for (const uid of targets) {
      stmt.run(uid, title, content, type, storeId || '', '/notifications', now);
    }

    // 外部推送：逐用户推送（读取个人设置 + 浏览器推送）
    for (const uid of targets) {
      const role = (db.prepare('SELECT role FROM users WHERE id = ?').get(uid) as any)?.role;
      if (!isContentTypeAllowed(role, type)) continue;
      sendPushNotification(uid, title, content, '/notifications').catch(() => {});
      sendToUser(uid, title, content).catch((e: any) => {
        console.warn('[推送] 用户' + uid + '外部推送失败:', e.message);
      });
    }
  } catch (e) {
    console.error('triggerNotification error:', e);
  }
}

// 供 report-scheduler 调用：向有权限的用户推送报表
export async function pushReportToUsers(title: string, textContent: string, htmlContent: string, reportType: string): Promise<void> {
  const users = db.prepare('SELECT id, role FROM users').all() as any[];
  for (const u of users) {
    if (!isContentTypeAllowed(u.role, reportType)) continue;
    // 检查用户的推送开关
    const settings = db.prepare('SELECT push_report FROM user_notification_settings WHERE user_id = ?').get(u.id) as any;
    if (settings && settings.push_report === 0) continue;
    // 写站内通知
    db.prepare('INSERT INTO notifications (user_id, title, content, type, read, created_at) VALUES (?,?,?,?,0,datetime("now","localtime"))').run(u.id, title, textContent, 'report');
    // 外部推送
    try { await sendToUser(u.id, title, textContent, htmlContent); } catch {}
  }
}
