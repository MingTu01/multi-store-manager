import Database from 'better-sqlite3';
const db = new Database('C:/Users/Administrator/Documents/6666/apps/server/backups/manual-2026-06-10T15-40-13.db');
const stores = db.prepare('SELECT id, name FROM stores').all();
console.log('Backup stores:');
stores.forEach((s: any) => console.log('  ' + s.id + ': ' + s.name));
const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
const entryCount = db.prepare('SELECT COUNT(*) as c FROM entries').get();
console.log('Users: ' + (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c + ', Entries: ' + (entryCount as any).c);
db.close();
