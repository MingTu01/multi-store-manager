import db from './db.js';
import { triggerNotification } from './notify-trigger.js';
import logger from './logger.js';

// Check health certificate expiry every day
// - 30 days before expiry: notify once per week (Monday)
// - On expiry date: notify every day
export function startHealthCheckScheduler() {
  const check = () => {
    try {
      const users = db.prepare("SELECT id, name, health_cert_expiry FROM users WHERE health_cert_expiry != '' AND health_cert_expiry IS NOT NULL AND health_cert_expiry != '0000-00-00'").all() as any[];
      const now = new Date();
      const today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon

      for (const user of users) {
        if (!user.health_cert_expiry) continue;
        const exp = new Date(user.health_cert_expiry);
        const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysLeft <= 0) {
          // Expired: notify every day
          triggerNotification({
            type: 'health_cert',
            action: user.name + ' \u5065\u5eb7\u8bc1\u5df2\u8fc7\u671f',
            targetUserId: user.id,
            detail: '\u5df2\u8fc7\u671f' + Math.abs(daysLeft) + '\u5929\uff0c\u8bf7\u7acb\u5373\u5904\u7406'
          });
        } else if (daysLeft <= 30 && dayOfWeek === 1) {
          // Within 30 days: notify once per week (Monday)
          triggerNotification({
            type: 'health_cert',
            action: user.name + ' \u5065\u5eb7\u8bc1\u5373\u5c06\u5230\u671f',
            targetUserId: user.id,
            detail: '\u8fd8\u5269' + daysLeft + '\u5929\u5230\u671f\uff0c\u8bf7\u5c3d\u5feb\u4f53\u68c0'
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
