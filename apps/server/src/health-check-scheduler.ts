import db from './db.js';
import { ROLES } from './lib/roles.js';
import { triggerNotification } from './notify-trigger.js';
import logger from './logger.js';

// Check health certificate expiry every day
// - 30 days before expiry: notify once per week (Monday)
// - On expiry date: notify every day
// 推送对象：ADMIN + 店铺管理员 + 店长 + 员工本人
export function startHealthCheckScheduler() {
  const check = () => {
    try {
      const users = db.prepare("SELECT id, name, store_id, health_cert_expiry FROM users WHERE health_cert_expiry != '' AND health_cert_expiry IS NOT NULL AND health_cert_expiry != '0000-00-00'").all() as any[];
      const now = new Date();
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon

      for (const user of users) {
        if (!user.health_cert_expiry) continue;
        const exp = new Date(user.health_cert_expiry);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) {
          // Expired: notify every day
          // 推送给 ADMIN + 店铺管理员 + 店长 + 员工本人（通过 storeId 触发 getTargetUsers 的多对象逻辑）
          triggerNotification({
            type: 'health_cert',
            action: '健康证已过期',
            storeId: user.store_id || undefined,
            targetUserId: user.id,
            detail: '员工 ' + user.name + ' 的健康证已过期 ' + Math.abs(daysLeft) + ' 天，请立即处理',
            operatorName: '系统'
          });
        } else if (daysLeft <= 30 && dayOfWeek === 1) {
          // Within 30 days: notify once per week (Monday)
          triggerNotification({
            type: 'health_cert',
            action: '健康证即将到期',
            storeId: user.store_id || undefined,
            targetUserId: user.id,
            detail: '员工 ' + user.name + ' 的健康证还剩 ' + daysLeft + ' 天到期，请尽快体检',
            operatorName: '系统'
          });
        }
      }
    } catch (e) {
      logger.error('Health check scheduler error:', e);
    }
  };

  // Run once on start, then every 24 hours
  check();
  setInterval(check, 24 * 60 * 60 * 1000);
}
