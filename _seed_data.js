const Database = require('better-sqlite3');
const db = new Database('/app/data/store.db');
const storeId = 'store_test_001';
const existing = db.prepare('SELECT id FROM stores WHERE id = ?').get(storeId);
if (!existing) {
  db.prepare("INSERT INTO stores (id, name, address, manager_id, status, initial_capital, is_open, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), datetime('now','localtime'))").run(storeId, '测试旗舰店', '广州天河区', 1, 'active', 50000, 1);
  db.prepare("INSERT INTO shareholders (store_id, name, ratio, phone) VALUES (?, ?, ?, ?)").run(storeId, '张三', 60, '13800138001');
  db.prepare("INSERT INTO shareholders (store_id, name, ratio, phone) VALUES (?, ?, ?, ?)").run(storeId, '李四', 40, '13800138002');
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('123456', 10);
  db.prepare("INSERT INTO users (username, password_hash, name, role, store_id) VALUES (?, ?, ?, ?, ?)").run('13800138001', hash, '张三', 'MANAGER', storeId);
  db.prepare("INSERT INTO users (username, password_hash, name, role, store_id) VALUES (?, ?, ?, ?, ?)").run('13800138002', hash, '李四', 'STAFF', storeId);
  const categories = ['餐饮', '零售', '服务', '房租', '水电', '工资'];
  const types = ['income', 'income', 'income', 'expense', 'expense', 'expense'];
  for (let i = 0; i < 30; i++) {
    const catIdx = Math.floor(Math.random() * categories.length);
    const date = '2026-06-' + String(1 + (i % 18)).padStart(2, '0');
    db.prepare("INSERT INTO entries (store_id, type, category, amount, note, date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))").run(storeId, types[catIdx], categories[catIdx], Math.round(Math.random() * 5000 + 100), 'test data', date);
  }
  const products = ['可乐', '薯片', '纸巾', '矿泉水', '咖啡'];
  for (const p of products) {
    db.prepare("INSERT INTO inventory_master (store_id, name, quantity, status) VALUES (?, ?, ?, ?)").run(storeId, p, Math.round(Math.random() * 100), 'normal');
  }
  db.prepare("INSERT INTO inventory_checks (store_id, status, note, created_by, created_at) VALUES (?, 'completed', '日常盘点', 1, datetime('now','localtime'))").run(storeId);
  console.log('Test data created');
} else {
  console.log('Already exists');
}
const stores = db.prepare('SELECT * FROM stores').all();
console.log('Stores: ' + stores.length);
console.log('Entries: ' + db.prepare('SELECT COUNT(*) as c FROM entries').get().c);