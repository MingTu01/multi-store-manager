import Database from 'better-sqlite3';
const db = new Database('C:/Users/Administrator/Documents/6666/apps/server/data/store.db');

// Check op_logs table
const logCount = db.prepare("SELECT COUNT(*) as c FROM op_logs").get();
console.log('Log count:', (logCount as any).c);

// Check if there's a constraint issue
const cols = db.prepare("PRAGMA table_info(op_logs)").all();
console.log('\nop_logs columns:');
cols.forEach((c: any) => console.log('  ' + c.name + ': ' + c.type));

db.close();
