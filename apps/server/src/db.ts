import Database from 'better-sqlite3';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import { mkdirSync } from 'fs';

mkdirSync(join(process.cwd(), 'data'), { recursive: true });
const dbPath = join(process.cwd(), 'data', 'store.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  role TEXT DEFAULT 'staff',
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
];

for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

// Seed default admin user
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('123456', 10);
  db.prepare("INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)").run('admin', hash, '管理员', 'admin');
}

// Seed default notification settings
const nsExists = db.prepare('SELECT id FROM notification_settings WHERE id = 1').get();
if (!nsExists) {
  db.prepare('INSERT INTO notification_settings (id) VALUES (1)').run();
}

export default db;
