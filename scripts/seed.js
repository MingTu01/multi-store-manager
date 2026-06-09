const path = require('path');
const Database = require(path.join(__dirname, '..', 'apps', 'server', 'node_modules', 'better-sqlite3'));
const bcrypt = require(path.join(__dirname, '..', 'apps', 'server', 'node_modules', 'bcryptjs'));

const db = new Database(path.join(__dirname, '..', 'apps', 'server', 'data', 'store.db'));

console.log('Cleaning data...');
db.pragma('journal_mode = WAL');
db.exec('DELETE FROM entries');
db.exec('DELETE FROM inventory_items');
db.exec('DELETE FROM inventory_checks');
db.exec('DELETE FROM store_opens');
db.exec('DELETE FROM handovers');
db.exec('DELETE FROM dividend_details');
db.exec('DELETE FROM dividends');
db.exec('DELETE FROM payroll_items');
db.exec('DELETE FROM payroll');
db.exec('DELETE FROM shareholders');
db.exec('DELETE FROM op_logs');
db.exec("DELETE FROM users WHERE username != 'admin'");
db.exec('DELETE FROM stores');

const stores = [
  { id: 's1', name: '城南旗舰店', address: '科技路88号', capital: 500000 },
  { id: 's2', name: '万达体验店', address: '万达广场3楼', capital: 300000 },
  { id: 's3', name: '大学城店', address: '大学路168号', capital: 200000 },
];
const insS = db.prepare('INSERT INTO stores (id,name,address,initial_capital,status) VALUES (?,?,?,?,?)');
for (const s of stores) insS.run(s.id, s.name, s.address, s.capital, '营业中');
console.log('3 stores created');

const hash = bcrypt.hashSync('123456', 10);
const users = [
  { u: 'mgr1', n: '张店长', r: 'MANAGER', sid: 's1' },
  { u: 'mgr2', n: '李经理', r: 'MANAGER', sid: 's2' },
  { u: 'mgr3', n: '王店长', r: 'MANAGER', sid: 's3' },
  { u: 'staff1', n: '小张', r: 'STAFF', sid: 's1' },
  { u: 'staff2', n: '小李', r: 'STAFF', sid: 's2' },
  { u: 'staff3', n: '小王', r: 'STAFF', sid: 's3' },
  { u: 'sharer1', n: '赵股东', r: 'SHAREHOLDER', sid: 's1' },
  { u: 'sharer2', n: '钱股东', r: 'SHAREHOLDER', sid: 's2' },
];
const insU = db.prepare('INSERT INTO users (username,password_hash,name,role,store_id,phone,status) VALUES (?,?,?,?,?,?,?)');
for (const u of users) insU.run(u.u, hash, u.n, u.r, u.sid, '138' + String(Math.floor(1e7+Math.random()*9e7)), 'active');
console.log(users.length + ' users created');

const insSH = db.prepare('INSERT INTO shareholders (store_id,name,ratio) VALUES (?,?,?)');
insSH.run('s1','赵股东',0.30); insSH.run('s1','张店长',0.20); insSH.run('s1','陈老板',0.50);
insSH.run('s2','钱股东',0.40); insSH.run('s2','李经理',0.15); insSH.run('s2','陈老板',0.45);
insSH.run('s3','陈老板',0.60); insSH.run('s3','王店长',0.40);

const insE = db.prepare('INSERT INTO entries (store_id,type,category,amount,note,date,created_by,is_system) VALUES (?,?,?,?,?,?,?,?)');
const inc = ['饮品销售','食品销售','外卖收入','其他收入'];
const exp = ['原料采购','房租','水电','人工','设备维护','包装材料'];
const R = (a,b) => Math.round((a+Math.random()*(b-a))*100)/100;
let total = 0;

for (const s of stores) {
  const rent = s.id==='s1'?15000:s.id==='s2'?12000:8000;
  for (let d=15;d<=30;d++) {
    const dt='2026-04-'+String(d).padStart(2,'0');
    for(let i=0;i<2+~~(Math.random()*3);i++){const c=inc[~~(Math.random()*4)];insE.run(s.id,'收入',c,R(300,2000),'',dt,10,0);total++;}
    insE.run(s.id,'支出','房租',rent,'月租',dt,10,0);total++;
    insE.run(s.id,'支出','水电',R(600,2000),'',dt,1,0);total++;
    insE.run(s.id,'支出','人工',R(500,1500),'',dt,1,0);total++;
    if(Math.random()>0.6){insE.run(s.id,'支出','原料采购',R(1000,5000),'',dt,10,0);total++;}
  }
  for (let d=1;d<=31;d++) {
    const dt='2026-05-'+String(d).padStart(2,'0');
    for(let i=0;i<2+~~(Math.random()*4);i++){const c=inc[~~(Math.random()*4)];insE.run(s.id,'收入',c,R(400,2500),'',dt,10,0);total++;}
    insE.run(s.id,'支出','房租',rent,'月租',dt,10,0);total++;
    insE.run(s.id,'支出','水电',R(700,2200),'',dt,1,0);total++;
    insE.run(s.id,'支出','人工',R(500,1500),'',dt,1,0);total++;
    if(Math.random()>0.5){insE.run(s.id,'支出','原料采购',R(1500,6000),'',dt,10,0);total++;}
    if(Math.random()>0.8){insE.run(s.id,'支出','设备维护',R(200,1500),'',dt,10,0);total++;}
  }
  for (let d=1;d<=9;d++) {
    const dt='2026-06-'+String(d).padStart(2,'0');
    for(let i=0;i<2+~~(Math.random()*3);i++){const c=inc[~~(Math.random()*4)];insE.run(s.id,'收入',c,R(500,2500),'',dt,10,0);total++;}
    insE.run(s.id,'支出','原料采购',R(1000,4000),'',dt,1,0);total++;
    if(Math.random()>0.5){insE.run(s.id,'支出','包装材料',R(200,800),'',dt,10,0);total++;}
  }
  console.log('Entries: ' + s.name);
}

console.log('Total entries: ' + total);
db.close();
console.log('Done!');