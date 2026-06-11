import db from './db.js';
import { localDateTime } from './lib/utils.js';

export function opLog(userId: number, storeId: number | string, action: string, detail: string, ip?: string) {
  const user = db.prepare('SELECT username, name FROM users WHERE id = ?').get(userId) as any;
  const userName = user?.name || user?.username || '';
  const now = localDateTime();
  const detailWithIp = ip ? detail + ' [IP:' + ip + ']' : detail;
  db.prepare('INSERT INTO op_logs (user_id, user_name, action, target, detail, created_at) VALUES (?,?,?,?,?,?)').run(userId, userName, action, String(storeId), detailWithIp, now);
}
