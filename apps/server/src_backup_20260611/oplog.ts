import db from './db.js';

function localDateTime(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 19).replace('T', ' ');
}

export function opLog(userId: number, storeId: number | string, action: string, detail: string) {
  const user = db.prepare('SELECT username, name FROM users WHERE id = ?').get(userId) as any;
  const userName = user?.name || user?.username || '';
  const now = localDateTime();
  db.prepare('INSERT INTO op_logs (user_id, user_name, action, target, detail, created_at) VALUES (?,?,?,?,?,?)').run(userId, userName, action, String(storeId), detail, now);
}