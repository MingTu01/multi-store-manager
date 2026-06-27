import Database from 'better-sqlite3';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { mkdirSync } from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BASE_DIR = join(__dirname, '..');

mkdirSync(join(BASE_DIR, 'data'), { recursive: true });
const dbPath = join(BASE_DIR, 'data', 'store.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'STAFF',
  store_id TEXT,
  avatar TEXT DEFAULT '',
  salary REAL DEFAULT 0,
  status TEXT DEFAULT 'active',
  job_title TEXT DEFAULT '',
  address TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  manager_id INTEGER,
  status TEXT DEFAULT 'active',
  initial_capital REAL DEFAULT 0,
  is_open INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS shareholders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  ratio REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  note TEXT DEFAULT '',
  date TEXT DEFAULT '',
  created_by INTEGER,
  is_system INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  note TEXT DEFAULT '',
  created_by INTEGER,
  checked_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  expected_qty REAL DEFAULT 0,
  actual_qty REAL DEFAULT 0,
  unit TEXT DEFAULT '',
  consumption REAL DEFAULT 0,
  photo TEXT DEFAULT '',
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inventory_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  photo TEXT DEFAULT '',
  status TEXT DEFAULT 'normal',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS inventory_check_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id INTEGER NOT NULL,
  master_id INTEGER,
  name TEXT NOT NULL,
  expected_qty REAL DEFAULT 0,
  consumption REAL DEFAULT 0,
  actual_qty REAL DEFAULT 0,
  status TEXT DEFAULT 'normal',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS handovers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  from_user_id INTEGER,
  to_user_id INTEGER,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS store_opens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id INTEGER,
  note TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  photos TEXT DEFAULT '[]',
  handover_content TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  total_amount REAL DEFAULT 0,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS dividend_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dividend_id INTEGER NOT NULL,
  shareholder_name TEXT DEFAULT '',
  ratio REAL DEFAULT 0,
  amount REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payroll (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  period TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  created_by INTEGER,
  total_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_id INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT DEFAULT '',
  base_amount REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  deduction REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  job_title TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS op_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT DEFAULT '',
  action TEXT DEFAULT '',
  target TEXT DEFAULT '',
  detail TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notification_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  method TEXT DEFAULT 'none',
  pushplus_token TEXT DEFAULT '',
  serverchan_key TEXT DEFAULT '',
  wecom_corpid TEXT DEFAULT '',
  wecom_agentid TEXT DEFAULT '',
  wecom_secret TEXT DEFAULT '',
  wecom_userid TEXT DEFAULT '',
  wecom_proxy_url TEXT DEFAULT 'https://wx.908521.xyz/',
  push_daily_report INTEGER DEFAULT 0,
  push_weekly_report INTEGER DEFAULT 0,
  push_monthly_report INTEGER DEFAULT 0,
  push_review_reminder INTEGER DEFAULT 0,
  push_alert INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS store_notification_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL UNIQUE,
  method TEXT DEFAULT 'none',
  pushplus_token TEXT DEFAULT '',
  serverchan_key TEXT DEFAULT '',
  wecom_corpid TEXT DEFAULT '',
  wecom_agentid TEXT DEFAULT '',
  wecom_secret TEXT DEFAULT '',
  wecom_userid TEXT DEFAULT '',
  wecom_proxy_url TEXT DEFAULT 'https://wx.908521.xyz/',
  push_daily_report INTEGER DEFAULT 0,
  push_weekly_report INTEGER DEFAULT 0,
  push_monthly_report INTEGER DEFAULT 0,
  push_review_reminder INTEGER DEFAULT 0,
  push_alert INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  store_id TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS purchase_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id TEXT NOT NULL,
  date TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  morning_qty REAL DEFAULT 0,
  afternoon_qty REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime')),
  UNIQUE(store_id, date, item_id)
);
`);

// Migrations - add columns that may not exist
const migrations = [
  "ALTER TABLE users ADD COLUMN name TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN salary REAL DEFAULT 0",
  "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
  "ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN updated_at TEXT",
  "ALTER TABLE stores ADD COLUMN manager_id INTEGER",
  "ALTER TABLE stores ADD COLUMN status TEXT DEFAULT 'active'",
  "ALTER TABLE stores ADD COLUMN initial_capital REAL DEFAULT 0",
  "ALTER TABLE stores ADD COLUMN is_open INTEGER DEFAULT 0",
  "ALTER TABLE stores ADD COLUMN updated_at TEXT",
  "ALTER TABLE entries ADD COLUMN is_system INTEGER DEFAULT 0",
  "ALTER TABLE entries ADD COLUMN date TEXT DEFAULT ''",
  "ALTER TABLE entries ADD COLUMN created_by INTEGER",
  "ALTER TABLE inventory_checks ADD COLUMN created_by INTEGER",
  "ALTER TABLE inventory_checks ADD COLUMN checked_by INTEGER",
  "ALTER TABLE inventory_items ADD COLUMN unit TEXT DEFAULT ''",
  "ALTER TABLE inventory_items ADD COLUMN consumption REAL DEFAULT 0",
  "ALTER TABLE inventory_items ADD COLUMN photo TEXT DEFAULT ''",
  "ALTER TABLE inventory_items ADD COLUMN note TEXT DEFAULT ''",
  "ALTER TABLE handovers ADD COLUMN status TEXT DEFAULT 'pending'",
  "ALTER TABLE store_opens ADD COLUMN user_id INTEGER",
  "ALTER TABLE store_opens ADD COLUMN photo TEXT DEFAULT ''",
  "ALTER TABLE store_opens ADD COLUMN photos TEXT DEFAULT '[]'",
  "ALTER TABLE store_opens ADD COLUMN handover_content TEXT DEFAULT ''",
  "ALTER TABLE dividends ADD COLUMN status TEXT DEFAULT 'draft'",
  "ALTER TABLE dividends ADD COLUMN created_by INTEGER",
  "ALTER TABLE dividend_details ADD COLUMN shareholder_name TEXT DEFAULT ''",
  "ALTER TABLE payroll ADD COLUMN created_by INTEGER",
  "ALTER TABLE payroll_items ADD COLUMN user_name TEXT DEFAULT ''",
  "ALTER TABLE op_logs ADD COLUMN user_name TEXT DEFAULT ''",
  "ALTER TABLE op_logs ADD COLUMN target TEXT DEFAULT ''",
  "ALTER TABLE notifications ADD COLUMN link TEXT DEFAULT ''",
  "ALTER TABLE shareholders ADD COLUMN phone TEXT DEFAULT ''",
  "ALTER TABLE entries ADD COLUMN category_id INTEGER",
  "ALTER TABLE payroll ADD COLUMN confirmed_at TEXT",
  "ALTER TABLE stores ADD COLUMN photos TEXT DEFAULT '[]'",
  "ALTER TABLE users ADD COLUMN health_cert_expiry TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN health_cert_photo TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN health_cert_url TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN health_cert_name TEXT DEFAULT ''",
  "ALTER TABLE users ADD COLUMN health_cert_verified INTEGER DEFAULT 0",
  "ALTER TABLE notifications ADD COLUMN content TEXT DEFAULT ''",
  "ALTER TABLE notifications ADD COLUMN type TEXT DEFAULT ''",
  "ALTER TABLE notifications ADD COLUMN store_id TEXT DEFAULT ''",
  "ALTER TABLE user_notification_settings ADD COLUMN push_entry INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_payroll INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_dividend INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_inventory INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_shift INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_purchase INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_health_cert INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_staff INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_store INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_report INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_review INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_alert INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN iyuu_token TEXT DEFAULT ''",
  "ALTER TABLE user_notification_settings ADD COLUMN push_daily_report INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_weekly_report INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_monthly_report INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_review_reminder INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_bookkeeping_notify INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_inventory_notify INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_openclose_notify INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_purchase_notify INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_salary_notify INTEGER DEFAULT 1",
  "ALTER TABLE user_notification_settings ADD COLUMN push_dividend_notify INTEGER DEFAULT 1",
  "CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, endpoint TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now','localtime')), UNIQUE(user_id, endpoint))",
  "ALTER TABLE op_logs ADD COLUMN ip TEXT DEFAULT ''",
  "CREATE TABLE IF NOT EXISTS user_notification_settings (user_id INTEGER PRIMARY KEY, pushplus_token TEXT DEFAULT '', serverchan_key TEXT DEFAULT '', wecom_corpid TEXT DEFAULT '', wecom_agentid TEXT DEFAULT '', wecom_secret TEXT DEFAULT '', wecom_userid TEXT DEFAULT '', wecom_proxy_url TEXT DEFAULT '', method TEXT DEFAULT 'none', iyuu_token TEXT DEFAULT '', push_entry INTEGER DEFAULT 1, push_payroll INTEGER DEFAULT 1, push_dividend INTEGER DEFAULT 1, push_inventory INTEGER DEFAULT 1, push_shift INTEGER DEFAULT 1, push_purchase INTEGER DEFAULT 1, push_health_cert INTEGER DEFAULT 1, push_staff INTEGER DEFAULT 1, push_store INTEGER DEFAULT 1, push_report INTEGER DEFAULT 1, push_review INTEGER DEFAULT 1, push_alert INTEGER DEFAULT 1, updated_at TEXT DEFAULT '')",
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (e) {
    if (!String(e).includes('already exists') && !String(e).includes('duplicate column')) console.error('Migration error:', e);
  }
}


// P1: 数据库索引 - 提升查询性能
const indexes = [
  "CREATE INDEX IF NOT EXISTS idx_entries_store_date ON entries(store_id, date)",
  "CREATE INDEX IF NOT EXISTS idx_entries_store_type_date ON entries(store_id, type, date)",
  "CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
  "CREATE INDEX IF NOT EXISTS idx_op_logs_created ON op_logs(created_at)",
  "CREATE INDEX IF NOT EXISTS idx_op_logs_target ON op_logs(target)",
  "CREATE INDEX IF NOT EXISTS idx_payroll_store ON payroll(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_dividends_store ON dividends(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_master_store ON inventory_master(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_store_opens_store ON store_opens(store_id, type)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read)",
  "CREATE INDEX IF NOT EXISTS idx_categories_store ON categories(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_shareholders_store ON shareholders(store_id)",
  "CREATE INDEX IF NOT EXISTS idx_dividend_details_dividend ON dividend_details(dividend_id)",
  "CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll ON payroll_items(payroll_id)",
  "CREATE INDEX IF NOT EXISTS idx_inventory_check_items_check ON inventory_check_items(check_id)",
  "CREATE INDEX IF NOT EXISTS idx_store_notification_settings_store ON store_notification_settings(store_id)",
    "CREATE INDEX IF NOT EXISTS idx_purchase_items_store ON purchase_items(store_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_purchase_records_store_date ON purchase_records(store_id, date)",
    "CREATE INDEX IF NOT EXISTS idx_purchase_records_item ON purchase_records(item_id)",
];
for (const sql of indexes) {
  try { db.exec(sql); } catch (e) { /* index may already exist */ }
}
// Seed default admin user
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const randomPassword = crypto.randomBytes(8).toString('hex');
  const hash = bcrypt.hashSync(randomPassword, 10);
  db.prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)")
    .run('admin', hash, '管理员', 'ADMIN');
  console.log('========================================');
  console.log('管理员账号已创建:');
  console.log('用户名: admin');
  console.log('密码: ' + randomPassword);
  console.log('请立即登录并修改密码！');
  console.log('========================================');
}

// Seed default notification settings
const nsExists = db.prepare('SELECT id FROM notification_settings WHERE id = 1').get();
if (!nsExists) {
  db.prepare('INSERT INTO notification_settings (id) VALUES (1)').run();
}

// Seed default categories
try {
  const catCount = (db.prepare('SELECT COUNT(*) as c FROM categories').get() as any).c;
  if (catCount === 0) {
    const defaultCategories: [string, string, number][] = [
      ['餐饮', 'income', 1], ['零售', 'income', 2], ['服务', 'income', 3],
      ['原材料', 'expense', 1], ['房租', 'expense', 2], ['水电', 'expense', 3], ['工资', 'expense', 4]
    ];
    const stmt = db.prepare('INSERT INTO categories (name, type, sort_order) VALUES (?, ?, ?)');
    for (const [name, type, order] of defaultCategories) stmt.run(name, type, order);
  }
} catch (e) { /* categories table may not exist yet */ }

// SQLite 写重试辅助函数 - 用于关键写操作时处理 SQLITE_BUSY
export function dbRunWithRetry(fn: () => any, maxRetries = 3): any {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (err: any) {
      if (err.code === 'SQLITE_BUSY' && i < maxRetries - 1) {
        // busy_timeout pragma handles the wait, just retry
        continue;
      }
      throw err;
    }
  }
}

export default db;