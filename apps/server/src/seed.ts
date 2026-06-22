if (process.env.NODE_ENV === 'production') { console.log('Seed skipped in production'); process.exit(0); }
import db from './db.js';
import bcrypt from 'bcryptjs';

export function seedDatabase() {
  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() as any;
  if (existingUsers.count > 1) {
    console.log('Database already seeded');
    return;
  }

  const hash = bcrypt.hashSync('123456', 10);

  // Create users
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role, job_title) VALUES (?,?,?,?)').run('shareholder', hash, 'shareholder', '股东');
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role, job_title, store_id) VALUES (?,?,?,?,?)').run('manager', hash, 'manager', '店长', 1);
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role, job_title, store_id) VALUES (?,?,?,?,?)').run('staff', hash, 'staff', '店员', 1);

  // Create stores
  db.prepare('INSERT INTO stores (name, address, initial_capital) VALUES (?,?,?)').run('示范店A', '北京市朝阳区建国路100号', 100000);
  db.prepare('INSERT INTO stores (name, address, initial_capital) VALUES (?,?,?)').run('示范店B', '上海市浦东新区陆家嘴200号', 80000);

  // Create shareholders
  const shareholder = db.prepare('SELECT id FROM users WHERE username = ?').get('shareholder') as any;
  db.prepare('INSERT INTO shareholders (store_id, user_id, ratio) VALUES (?,?,?)').run(1, shareholder.id, 30);
  db.prepare('INSERT INTO shareholders (store_id, user_id, ratio) VALUES (?,?,?)').run(1, 1, 70);
  db.prepare('INSERT INTO shareholders (store_id, user_id, ratio) VALUES (?,?,?)').run(2, shareholder.id, 50);
  db.prepare('INSERT INTO shareholders (store_id, user_id, ratio) VALUES (?,?,?)').run(2, 1, 50);

  // Create sample entries for today
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const categories = ['餐饮', '零售', '服务', '原材料', '房租', '水电'];

  db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(1, '收入', categories[0], 2580.50, '今日餐饮收入', today, 1);
  db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(1, '收入', categories[1], 1350.00, '今日零售收入', today, 1);
  db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(1, '支出', categories[3], 800.00, '采购原材料', today, 1);
  db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(2, '收入', categories[2], 3200.00, '今日服务收入', today, 1);
  db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(2, '支出', categories[4], 5000.00, '月租金', today, 1);

  // Create sample entries for earlier this month
  for (let i = 1; i <= 5; i++) {
    const d = month + '-' + String(i).padStart(2, '0');
    db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(1, '收入', categories[0], Math.round(Math.random() * 3000 + 1000), '餐饮收入', d, 1);
    db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(1, '支出', categories[5], Math.round(Math.random() * 500 + 100), '水电费', d, 1);
    db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by) VALUES (?,?,?,?,?,?,?)').run(2, '收入', categories[1], Math.round(Math.random() * 2000 + 800), '零售收入', d, 1);
  }

  console.log('Database seeded with demo data');
}

seedDatabase();
