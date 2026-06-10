import Database from 'better-sqlite3';
const db = new Database('C:/Users/Administrator/Documents/6666/apps/server/data/store.db');

// Try to insert the same entry that confirm creates
try {
  db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system) VALUES (?,?,?,?,?,?,?,1)").run('s1', '支出', '工资', 36909, '工资支出 2026-06 #2', '2026-06-11', 1);
  console.log('Insert succeeded');
  // Delete it
  db.prepare("DELETE FROM entries WHERE note = '工资支出 2026-06 #2'").run();
  console.log('Cleanup done');
} catch (err: any) {
  console.log('Insert failed:', err.message);
}

// Check table schema
const info = db.prepare("PRAGMA table_info(entries)").all();
console.log('\nEntries columns:');
info.forEach((c: any) => console.log('  ' + c.name + ': ' + c.type + (c.notnull ? ' NOT NULL' : '') + (c.dflt_value ? ' DEFAULT ' + c.dflt_value : '')));

db.close();
