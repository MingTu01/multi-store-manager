import db from './db.js';
import { triggerNotification } from './notify-trigger.js';

// 健康证到期检查 - 每天检查一次
export function startHealthCertCheck(): void {
  // 启动时先执行一次检查
  checkHealthCerts();

  // 每24小时检查一次
  setInterval(checkHealthCerts, 86400000);
  console.log('健康证到期检查已启动，每24小时执行一次');
}

function checkHealthCerts(): void {
  try {
    const now = new Date();
    const users = db.prepare(
      "SELECT id, name, health_cert_expiry, store_id FROM users WHERE health_cert_expiry IS NOT NULL AND health_cert_expiry != '' AND status = 'active'"
    ).all() as any[];

    let expiredCount = 0;
    let expiringCount = 0;

    for (const user of users) {
      const expiryDate = new Date(user.health_cert_expiry);
      const daysLeft = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        expiredCount++;
        triggerNotification({
          type: 'health_cert',
          action: '健康证已过期',
          detail: user.name + ' 的健康证已过期，到期日: ' + user.health_cert_expiry,
          targetUserId: user.id,
          storeId: user.store_id || undefined
        });
      } else if (daysLeft <= 30) {
        expiringCount++;
        triggerNotification({
          type: 'health_cert',
          action: '健康证即将过期',
          detail: user.name + ' 的健康证将于' + daysLeft + '天后过期，到期日: ' + user.health_cert_expiry,
          targetUserId: user.id,
          storeId: user.store_id || undefined
        });
      }
    }

    console.log('健康证检查完成: ' + expiredCount + '人已过期, ' + expiringCount + '人即将过期');
  } catch (err) {
    console.error('健康证检查失败:', err);
  }
}
