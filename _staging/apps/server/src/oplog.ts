import db from './db.js';
import { localDateTime } from './lib/utils.js';

export function opLog(userId: number, storeId: number | string, action: string, detail: string, ip?: string) {
  const user = db.prepare('SELECT username, name FROM users WHERE id = ?').get(userId) as any;
  const userName = user?.name || user?.username || '';
  const now = localDateTime();
  // Normalize IPv6 localhost
  const normalizedIp = ip === '::1' ? '127.0.0.1' : (ip || '');
  db.prepare('INSERT INTO op_logs (user_id, user_name, action, target, detail, created_at, ip) VALUES (?,?,?,?,?,?,?)').run(userId, userName, action, String(storeId), detail, now, normalizedIp);
}
