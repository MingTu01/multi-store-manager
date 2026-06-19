// seed-test-data.ts - 种子数据生成脚本
// 生成5家店铺的完整测试数据（2024-06 至 2026-06）
// 运行方式: cd apps/server && npx tsx src/seed-test-data.ts

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { join } from 'path';

const dir = process.cwd();
const db = new Database(join(dir, 'data', 'store.db'));
db.pragma('journal_mode = WAL');

// ========== 工具函数 ==========
function R(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}
function RI(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function randPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randPhone(): string { return '138' + String(RI(10000000, 99999999)); }
function pad(n: number): string { return String(n).padStart(2, '0'); }
function genDate(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}`; }
function genDateTime(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)} ${pad(RI(8,22))}:${pad(RI(0,59))}:${pad(RI(0,59))}`;
}
function daysInMonth(y: number, m: number): number { return new Date(y, m, 0).getDate(); }

// ========== 清空现有测试数据（保留admin） ==========
console.log('');
console.log('========== 清空现有数据 ==========');
const tablesToClean = [
  'entries', 'inventory_items', 'inventory_checks', 'inventory_check_items',
  'store_opens', 'handovers', 'dividend_details', 'dividends',
  'payroll_items', 'payroll', 'shareholders', 'op_logs',
  'notifications', 'inventory_master', 'categories',
];
for (const t of tablesToClean) { try { db.exec('DELETE FROM ' + t); } catch {} }
db.exec("DELETE FROM users WHERE username != 'admin'");
db.exec('DELETE FROM stores');
console.log('数据已清空（保留admin用户）');

const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get() as any;
const AID = admin ? admin.id : 1;
console.log('Admin ID:', AID);

// ========== 店铺数据 ==========
const stores = [
  { id: 'store-1', name: '城南旗舰店',   addr: '广州市天河区天河路385号',           cap: 500000 },
  { id: 'store-2', name: '城北潮流店',   addr: '广州市越秀区北京路步行街128号',     cap: 300000 },
  { id: 'store-3', name: '城东体验店',   addr: '广州市海珠区江南大道中168号',       cap: 400000 },
  { id: 'store-4', name: '城西精品店',   addr: '广州市荔湾区上下九步行街88号',     cap: 250000 },
  { id: 'store-5', name: '大学城概念店', addr: '广州市番禺区大学城贝岗村大街12号', cap: 200000 },
];

const insertStore = db.prepare('INSERT INTO stores (id, name, address, status, initial_capital, is_open) VALUES (?, ?, ?, ?, ?, ?)');
for (const s of stores) insertStore.run(s.id, s.name, s.addr, '营业中', s.cap, 1);
console.log('已插入 ' + stores.length + ' 家店铺');

// ========== 股东数据 ==========
const shareholdersData: Record<string, { name: string; ratio: number; phone: string }[]> = {
  'store-1': [
    { name: '陈老板', ratio: 50, phone: '13900110001' },
    { name: '赵股东', ratio: 30, phone: '13900110002' },
    { name: '张店长', ratio: 20, phone: '13900110003' },
  ],
  'store-2': [
    { name: '李大股东', ratio: 55, phone: '13900220001' },
    { name: '钱股东',   ratio: 45, phone: '13900220002' },
  ],
  'store-3': [
    { name: '王老板', ratio: 40, phone: '13900330001' },
    { name: '孙股东', ratio: 35, phone: '13900330002' },
    { name: '周股东', ratio: 25, phone: '13900330003' },
  ],
  'store-4': [
    { name: '吴老板', ratio: 60, phone: '13900440001' },
    { name: '郑股东', ratio: 40, phone: '13900440002' },
  ],
  'store-5': [
    { name: '冯老板', ratio: 45, phone: '13900550001' },
    { name: '卫股东', ratio: 30, phone: '13900550002' },
    { name: '蒋股东', ratio: 25, phone: '13900550003' },
  ],
};

const insertShareholder = db.prepare('INSERT INTO shareholders (store_id, name, ratio, phone) VALUES (?, ?, ?, ?)');
let shareholderCount = 0;
for (const [storeId, list] of Object.entries(shareholdersData)) {
  for (const sh of list) { insertShareholder.run(storeId, sh.name, sh.ratio, sh.phone); shareholderCount++; }
}
console.log('已插入 ' + shareholderCount + ' 名股东');

// ========== 员工数据 ==========
const hash = bcrypt.hashSync('123456', 10);

interface EmployeeDef { username: string; name: string; role: string; storeId: string; salary: number; job_title: string; }

const employees: EmployeeDef[] = [
  // store-1 城南旗舰店 (5人)
  { username: 'mgr_s1',     name: '张伟', role: 'MANAGER', storeId: 'store-1', salary: 8000, job_title: '店长' },
  { username: 'staff_s1_1', name: '李娜', role: 'STAFF',   storeId: 'store-1', salary: 5000, job_title: '副店长' },
  { username: 'staff_s1_2', name: '王强', role: 'STAFF',   storeId: 'store-1', salary: 4500, job_title: '导购员' },
  { username: 'staff_s1_3', name: '刘芳', role: 'STAFF',   storeId: 'store-1', salary: 4000, job_title: '收银员' },
  { username: 'staff_s1_4', name: '陈杰', role: 'STAFF',   storeId: 'store-1', salary: 3500, job_title: '仓管员' },
  // store-2 城北潮流店 (3人)
  { username: 'mgr_s2',     name: '赵敏', role: 'MANAGER', storeId: 'store-2', salary: 7500, job_title: '店长' },
  { username: 'staff_s2_1', name: '孙磊', role: 'STAFF',   storeId: 'store-2', salary: 5000, job_title: '副店长' },
  { username: 'staff_s2_2', name: '周婷', role: 'STAFF',   storeId: 'store-2', salary: 4000, job_title: '导购员' },
  // store-3 城东体验店 (4人)
  { username: 'mgr_s3',     name: '吴涛', role: 'MANAGER', storeId: 'store-3', salary: 7000, job_title: '店长' },
  { username: 'staff_s3_1', name: '郑丽', role: 'STAFF',   storeId: 'store-3', salary: 5500, job_title: '副店长' },
  { username: 'staff_s3_2', name: '冯刚', role: 'STAFF',   storeId: 'store-3', salary: 4500, job_title: '导购员' },
  { username: 'staff_s3_3', name: '何静', role: 'STAFF',   storeId: 'store-3', salary: 3800, job_title: '收银员' },
  // store-4 城西精品店 (3人)
  { username: 'mgr_s4',     name: '黄明', role: 'MANAGER', storeId: 'store-4', salary: 6500, job_title: '店长' },
  { username: 'staff_s4_1', name: '林华', role: 'STAFF',   storeId: 'store-4', salary: 4000, job_title: '导购员' },
  { username: 'staff_s4_2', name: '罗佳', role: 'STAFF',   storeId: 'store-4', salary: 3500, job_title: '收银员' },
  // store-5 大学城概念店 (4人)
  { username: 'mgr_s5',     name: '谢峰', role: 'MANAGER', storeId: 'store-5', salary: 6000, job_title: '店长' },
  { username: 'staff_s5_1', name: '韩雪', role: 'STAFF',   storeId: 'store-5', salary: 4500, job_title: '副店长' },
  { username: 'staff_s5_2', name: '唐亮', role: 'STAFF',   storeId: 'store-5', salary: 3500, job_title: '导购员' },
  { username: 'staff_s5_3', name: '邓丽', role: 'STAFF',   storeId: 'store-5', salary: 3000, job_title: '收银员' },
];

const insertUser = db.prepare('INSERT INTO users (username, password_hash, name, role, store_id, phone, salary, status, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
for (const e of employees) insertUser.run(e.username, hash, e.name, e.role, e.storeId, randPhone(), e.salary, 'active', e.job_title);
console.log('已插入 ' + employees.length + ' 名员工');

// 更新店铺的 manager_id
const updateStoreManager = db.prepare('UPDATE stores SET manager_id = ? WHERE id = ?');
const storeManagers = employees.filter(e => e.role === 'MANAGER');
for (const mgr of storeManagers) {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(mgr.username) as any;
  if (row) updateStoreManager.run(row.id, mgr.storeId);
}

// 获取所有员工的id映射
const userIdMap: Record<string, number> = {};
const allUsers = db.prepare("SELECT id, username, store_id FROM users WHERE username != 'admin'").all() as any[];
for (const u of allUsers) userIdMap[u.username] = u.id;
console.log('用户ID映射已建立');

// ========== 库存商品（inventory_master） ==========
const inventoryMasterData: Record<string, { name: string; qty: number }[]> = {
  'store-1': [
    { name: 'T恤', qty: 120 }, { name: '卫衣', qty: 80 }, { name: '牛仔裤', qty: 95 },
    { name: '运动鞋', qty: 60 }, { name: '帽子', qty: 150 }, { name: '背包', qty: 45 },
    { name: '围巾', qty: 70 }, { name: '手套', qty: 200 },
  ],
  'store-2': [
    { name: 'T恤', qty: 100 }, { name: '卫衣', qty: 65 }, { name: '牛仔裤', qty: 80 },
    { name: '运动鞋', qty: 50 }, { name: '帽子', qty: 120 }, { name: '背包', qty: 40 },
  ],
  'store-3': [
    { name: 'T恤', qty: 90 }, { name: '卫衣', qty: 70 }, { name: '牛仔裤', qty: 85 },
    { name: '运动鞋', qty: 55 }, { name: '帽子', qty: 130 }, { name: '背包', qty: 50 }, { name: '围巾', qty: 60 },
  ],
  'store-4': [
    { name: 'T恤', qty: 80 }, { name: '卫衣', qty: 55 }, { name: '运动鞋', qty: 45 },
    { name: '帽子', qty: 100 }, { name: '围巾', qty: 50 }, { name: '手套', qty: 150 },
  ],
  'store-5': [
    { name: 'T恤', qty: 110 }, { name: '卫衣', qty: 60 }, { name: '牛仔裤', qty: 75 },
    { name: '运动鞋', qty: 40 }, { name: '帽子', qty: 90 }, { name: '背包', qty: 35 },
  ],
};

const insertMaster = db.prepare('INSERT INTO inventory_master (store_id, name, quantity, status, sort_order) VALUES (?, ?, ?, ?, ?)');
const masterIdMap: Record<string, Record<string, number>> = {};
let masterCount = 0;
for (const [storeId, items] of Object.entries(inventoryMasterData)) {
  masterIdMap[storeId] = {};
  items.forEach((item, idx) => {
    const result = insertMaster.run(storeId, item.name, item.qty, 'normal', idx);
    masterIdMap[storeId][item.name] = result.lastInsertRowid as number;
    masterCount++;
  });
}
console.log('已插入 ' + masterCount + ' 个库存商品');

// ========== 盘点记录（2024-06 至 2026-05，每月1次，共24次/店） ==========
const insertCheck = db.prepare('INSERT INTO inventory_checks (store_id, status, note, created_by, checked_by, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertCheckItem = db.prepare('INSERT INTO inventory_check_items (check_id, master_id, name, expected_qty, consumption, actual_qty, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\',\'localtime\'))');

let checkCount = 0;
let checkItemCount = 0;

for (const s of stores) {
  const items = inventoryMasterData[s.id];
  const mgr = storeManagers.find(m => m.storeId === s.id);
  const mgrUser = db.prepare('SELECT id FROM users WHERE username = ?').get(mgr!.username) as any;
  const mgrId = mgrUser ? mgrUser.id : AID;
  const staffForStore = employees.filter(e => e.storeId === s.id && e.role === 'STAFF');
  const staffUser = db.prepare('SELECT id FROM users WHERE username = ?').get(staffForStore[0].username) as any;
  const staffId = staffUser ? staffUser.id : AID;

  for (let y = 2024; y <= 2026; y++) {
    const startMonth = y === 2024 ? 6 : 1;
    const endMonth = y === 2026 ? 5 : 12;
    for (let m = startMonth; m <= endMonth; m++) {
      const day = Math.min(RI(25, 28), daysInMonth(y, m));
      const createdAt = genDateTime(y, m, day);
      const note = y + '年' + m + '月盘点';

      const checkResult = insertCheck.run(s.id, 'confirmed', note, mgrId, staffId, createdAt);
      const checkId = checkResult.lastInsertRowid as number;
      checkCount++;

      for (const item of items) {
        const masterId = masterIdMap[s.id][item.name];
        const consumption = RI(2, 20);
        const expected = item.qty - consumption;
        const variance = RI(-3, 3);
        const actual = Math.max(0, expected + variance);
        const status = Math.abs(variance) <= 1 ? 'normal' : (variance < 0 ? 'shortage' : 'surplus');
        insertCheckItem.run(checkId, masterId, item.name, expected, consumption, actual, status);
        checkItemCount++;
      }
    }
  }
}
console.log('已插入 ' + checkCount + ' 条盘点记录, ' + checkItemCount + ' 个盘点项');

// ========== 记账（entries）2024-06 至 2026-06，每天1-3条 ==========
const incomeCategories = ['零售', '批发', '会员充值', '线上销售'];
const expenseCategories = ['房租', '水电', '人工', '采购', '营销', '维修'];
const expenseNotes: Record<string, string[]> = {
  '房租': ['月租', '物业费'],
  '水电': ['电费', '水费', '燃气费'],
  '人工': ['临时工费用', '加班费', '社保缴纳'],
  '采购': ['服装采购', '鞋类采购', '配件采购', '季节性补货'],
  '营销': ['广告投放', '促销物料', '活动费用'],
  '维修': ['设备维修', '装修维护', '空调维修'],
};

const insertEntry = db.prepare('INSERT INTO entries (store_id, type, category, amount, note, date, created_by, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

let entryCount = 0;
const storeRentMap: Record<string, number> = {
  'store-1': 15000, 'store-2': 10000, 'store-3': 12000, 'store-4': 8000, 'store-5': 6000,
};

const tx = db.transaction(() => {
  for (const s of stores) {
    const rent = storeRentMap[s.id];
    const startDate = new Date(2024, 5, 1);
    const endDate = new Date(2026, 5, 20);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const day = d.getDate();
      const dateStr = genDate(year, month, day);
      const createdAtBase = genDateTime(year, month, day);

      // 收入 1-2 条
      const incomeCount = RI(1, 2);
      for (let i = 0; i < incomeCount; i++) {
        const cat = randPick(incomeCategories);
        let amount: number;
        if (cat === '批发') amount = R(2000, 15000);
        else if (cat === '会员充值') amount = R(500, 5000);
        else if (cat === '线上销售') amount = R(300, 8000);
        else amount = R(500, 5000);
        insertEntry.run(s.id, 'income', cat, amount, '', dateStr, AID, 0, createdAtBase);
        entryCount++;
      }

      // 房租：每月1号
      if (day === 1) {
        insertEntry.run(s.id, 'expense', '房租', rent, '月租', dateStr, AID, 0, createdAtBase);
        entryCount++;
      }
      // 水电：每月15号
      if (day === 15) {
        insertEntry.run(s.id, 'expense', '水电', R(800, 3000), '水电费', dateStr, AID, 0, createdAtBase);
        entryCount++;
      }
      // 随机其他支出
      if (Math.random() > 0.5 && day !== 1 && day !== 15) {
        const eCat = randPick(['人工', '采购', '营销', '维修']);
        const notes = expenseNotes[eCat];
        let amount: number;
        if (eCat === '采购') amount = R(1000, 30000);
        else if (eCat === '人工') amount = R(200, 3000);
        else if (eCat === '营销') amount = R(500, 5000);
        else amount = R(100, 3000);
        insertEntry.run(s.id, 'expense', eCat, amount, randPick(notes), dateStr, AID, 0, createdAtBase);
        entryCount++;
      }
    }
    console.log('  ' + s.name + ' 记账数据已生成');
  }
});
tx();
console.log('已插入 ' + entryCount + ' 条记账记录');

// ========== 工资（payroll + payroll_items）24个月 ==========
const insertPayroll = db.prepare('INSERT INTO payroll (store_id, period, status, created_by, total_amount, created_at, confirmed_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
const insertPayrollItem = db.prepare('INSERT INTO payroll_items (payroll_id, user_id, user_name, base_amount, bonus, deduction, total_amount, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

let payrollCount = 0;
let payrollItemCount = 0;

for (const s of stores) {
  const storeEmployees = employees.filter(e => e.storeId === s.id);
  for (let y = 2024; y <= 2026; y++) {
    const startMonth = y === 2024 ? 6 : 1;
    const endMonth = y === 2026 ? 5 : 12;
    for (let m = startMonth; m <= endMonth; m++) {
      const period = y + '-' + pad(m);
      const createdAt = genDateTime(y, m, RI(25, 28));

      let totalAmount = 0;
      const itemRows: any[] = [];
      for (const emp of storeEmployees) {
        const bonus = Math.random() > 0.6 ? R(200, 2000) : 0;
        const deduction = Math.random() > 0.8 ? R(50, 500) : 0;
        const total = emp.salary + bonus - deduction;
        totalAmount += total;
        itemRows.push({ userId: userIdMap[emp.username], userName: emp.name, baseAmount: emp.salary, bonus, deduction, total, jobTitle: emp.job_title });
      }
      const pr = insertPayroll.run(s.id, period, 'archived', AID, totalAmount, createdAt, createdAt);
      const payrollId = pr.lastInsertRowid as number;
      payrollCount++;
      for (const item of itemRows) {
        insertPayrollItem.run(payrollId, item.userId, item.userName, item.baseAmount, item.bonus, item.deduction, item.total, item.jobTitle);
        payrollItemCount++;
      }
    }
  }
}
console.log('已插入 ' + payrollCount + ' 条工资记录, ' + payrollItemCount + ' 条工资明细');

// ========== 分红（dividends + dividend_details）每季度1次，8次 ==========
const insertDividend = db.prepare('INSERT INTO dividends (store_id, total_amount, note, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)');
const insertDividendDetail = db.prepare('INSERT INTO dividend_details (dividend_id, shareholder_name, ratio, amount) VALUES (?, ?, ?, ?)');

const quarters = [
  { y: 2024, q: 3, label: '2024年Q3' }, { y: 2024, q: 4, label: '2024年Q4' },
  { y: 2025, q: 1, label: '2025年Q1' }, { y: 2025, q: 2, label: '2025年Q2' },
  { y: 2025, q: 3, label: '2025年Q3' }, { y: 2025, q: 4, label: '2025年Q4' },
  { y: 2026, q: 1, label: '2026年Q1' }, { y: 2026, q: 2, label: '2026年Q2' },
];

let dividendCount = 0;
let dividendDetailCount = 0;

for (const s of stores) {
  const shList = shareholdersData[s.id];
  for (const q of quarters) {
    const month = q.q * 3;
    const day = Math.min(RI(28, 30), daysInMonth(q.y, month));
    const createdAt = genDateTime(q.y, month, day);
    const totalAmount = R(20000, 150000);
    const dr = insertDividend.run(s.id, totalAmount, q.label + '分红', 'archived', AID, createdAt);
    const dividendId = dr.lastInsertRowid as number;
    dividendCount++;
    for (const sh of shList) {
      const amount = Math.round(totalAmount * sh.ratio / 100 * 100) / 100;
      insertDividendDetail.run(dividendId, sh.name, sh.ratio, amount);
      dividendDetailCount++;
    }
  }
}
console.log('已插入 ' + dividendCount + ' 条分红记录, ' + dividendDetailCount + ' 条分红明细');

// ========== 统计信息 ==========
console.log('');
console.log('========== 数据库统计 ==========');
const stats: Record<string, number> = {};
const statTables = ['stores', 'users', 'shareholders', 'entries', 'inventory_master', 'inventory_checks', 'inventory_check_items', 'payroll', 'payroll_items', 'dividends', 'dividend_details'];
for (const t of statTables) {
  try { const row = db.prepare('SELECT COUNT(*) as cnt FROM ' + t).get() as any; stats[t] = row.cnt; } catch { stats[t] = -1; }
}
for (const [table, count] of Object.entries(stats)) console.log('  ' + table + ': ' + count + ' 条');

console.log('');
console.log('========== 各店铺记账统计 ==========');
for (const s of stores) {
  const incomeRow = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type='income'").get(s.id) as any;
  const expenseRow = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM entries WHERE store_id=? AND type='expense'").get(s.id) as any;
  console.log('  ' + s.name + ': 收入 ' + incomeRow.cnt + ' 笔 (¥' + incomeRow.total.toFixed(2) + ') / 支出 ' + expenseRow.cnt + ' 笔 (¥' + expenseRow.total.toFixed(2) + ')');
}

db.close();
console.log('');
console.log('✅ 种子数据生成完成！');