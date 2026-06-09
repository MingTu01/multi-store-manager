import db from './db.js';

export function opLog(userId: number, storeId: number, action: string, detail: string) {
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
  const userName = user?.username || '';
  db.prepare('INSERT INTO op_logs (user_id, user_name, action, target, detail) VALUES (?,?,?,?,?)').run(userId, userName, action, String(storeId), detail);
}
