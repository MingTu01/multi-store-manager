const Database = require('better-sqlite3');
const db = new Database('/app/data/store.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
const stores = db.prepare('SELECT * FROM stores').all();
const users = db.prepare('SELECT id, username, role, store_id FROM users').all();
console.log(JSON.stringify({ tables, stores, users }));