import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const dir = process.cwd();
const db = new Database(join(dir, 'data', 'store.db'));

console.log('Cleaning...');
db.pragma('journal_mode = WAL');
for (const t of ['entries','inventory_items','inventory_checks','store_opens','handovers','dividend_details','dividends','payroll_items','payroll','shareholders','op_logs'])
  try { db.exec('DELETE FROM ' + t); } catch {}
db.exec("DELETE FROM users WHERE username != 'admin'");
db.exec('DELETE FROM stores');

const admin = db.prepare("SELECT id FROM users WHERE username='admin'").get();
const AID = admin ? admin.id : 1;
console.log('Admin ID:', AID);

const stores = [
  { id:'s1', name:'城南旗舰店', addr:'科技路88号', cap:500000 },
  { id:'s2', name:'万达体验店', addr:'万达广场3楼', cap:300000 },
  { id:'s3', name:'大学城店', addr:'大学路168号', cap:200000 },
];
const iS = db.prepare('INSERT INTO stores (id,name,address,initial_capital,status) VALUES (?,?,?,?,?)');
for (const s of stores) iS.run(s.id, s.name, s.addr, s.cap, '营业中');

const h = bcrypt.hashSync('123456', 10);
const iU = db.prepare('INSERT INTO users (username,password_hash,name,role,store_id,phone,status) VALUES (?,?,?,?,?,?,?)');
[
  ['mgr1','张店长','MANAGER','s1'], ['mgr2','李经理','MANAGER','s2'], ['mgr3','王店长','MANAGER','s3'],
  ['staff1','小张','STAFF','s1'], ['staff2','小李','STAFF','s2'], ['staff3','小王','STAFF','s3'],
  ['sharer1','赵股东','SHAREHOLDER','s1'], ['sharer2','钱股东','SHAREHOLDER','s2'],
].forEach(([u,n,r,sid]) => iU.run(u,h,n,r,sid,'138'+Math.floor(1e7+Math.random()*9e7),'active'));

const iSH = db.prepare('INSERT INTO shareholders (store_id,name,ratio) VALUES (?,?,?)');
iSH.run('s1','赵股东',0.30); iSH.run('s1','张店长',0.20); iSH.run('s1','陈老板',0.50);
iSH.run('s2','钱股东',0.40); iSH.run('s2','李经理',0.15); iSH.run('s2','陈老板',0.45);
iSH.run('s3','陈老板',0.60); iSH.run('s3','王店长',0.40);

const iE = db.prepare('INSERT INTO entries (store_id,type,category,amount,note,date,created_by,is_system) VALUES (?,?,?,?,?,?,?,?)');
const IC = ['饮品销售','食品销售','外卖收入','其他收入'];
const R = (a,b) => Math.round((a+Math.random()*(b-a))*100)/100;
let T = 0;
const tx = db.transaction(() => {
  for (const s of stores) {
    const rent = s.id==='s1'?15000:s.id==='s2'?12000:8000;
    // April 15-30
    for (let d=15;d<=30;d++) {
      const dt = '2026-04-'+String(d).padStart(2,'0');
      const n = 2+~~(Math.random()*3);
      for(let i=0;i<n;i++) { iE.run(s.id,'收入',IC[~~(Math.random()*4)],R(300,2000),'',dt,AID,0); T++; }
      iE.run(s.id,'支出','房租',rent,'月租',dt,AID,0); T++;
      iE.run(s.id,'支出','水电',R(600,2000),'',dt,AID,0); T++;
      iE.run(s.id,'支出','人工',R(500,1500),'',dt,AID,0); T++;
      if(Math.random()>0.6) { iE.run(s.id,'支出','原料采购',R(1000,5000),'',dt,AID,0); T++; }
    }
    // May 1-31
    for (let d=1;d<=31;d++) {
      const dt = '2026-05-'+String(d).padStart(2,'0');
      const n = 2+~~(Math.random()*4);
      for(let i=0;i<n;i++) { iE.run(s.id,'收入',IC[~~(Math.random()*4)],R(400,2500),'',dt,AID,0); T++; }
      iE.run(s.id,'支出','房租',rent,'月租',dt,AID,0); T++;
      iE.run(s.id,'支出','水电',R(700,2200),'',dt,AID,0); T++;
      iE.run(s.id,'支出','人工',R(500,1500),'',dt,AID,0); T++;
      if(Math.random()>0.5) { iE.run(s.id,'支出','原料采购',R(1500,6000),'',dt,AID,0); T++; }
      if(Math.random()>0.8) { iE.run(s.id,'支出','设备维护',R(200,1500),'',dt,AID,0); T++; }
    }
    // June 1-9
    for (let d=1;d<=9;d++) {
      const dt = '2026-06-'+String(d).padStart(2,'0');
      const n = 2+~~(Math.random()*3);
      for(let i=0;i<n;i++) { iE.run(s.id,'收入',IC[~~(Math.random()*4)],R(500,2500),'',dt,AID,0); T++; }
      iE.run(s.id,'支出','原料采购',R(1000,4000),'',dt,AID,0); T++;
      if(Math.random()>0.5) { iE.run(s.id,'支出','包装材料',R(200,800),'',dt,AID,0); T++; }
    }
    console.log('Done:', s.name);
  }
});
tx();
console.log('Total entries:', T);
db.close();
console.log('Seed complete!');