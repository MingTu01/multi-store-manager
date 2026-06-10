const BASE = 'http://localhost:3001/api';
async function req(path, method = 'GET', body = null, token = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  const data = await r.json();
  if (!r.ok) console.error('Error:', path, data);
  return data;
}
async function main() {
  const login = await req('/auth/login', 'POST', { username: 'admin', password: '123456' });
  const token = login.token;
  console.log('Logged in');
  const stores = [
    { id: 's1', name: '城南旗舰店', address: '城南大道168号', initial_capital: 500000 },
    { id: 's2', name: '万达体验店', address: '万达广场3楼A区', initial_capital: 300000 },
    { id: 's3', name: '大学城店', address: '大学城北路88号', initial_capital: 200000 }
  ];
  for (const s of stores) {
    const r = await req('/stores', 'POST', s, token);
    if (r.error) console.log('Store ' + s.name + ': ' + r.error);
    else console.log('Created: ' + s.name);
  }
  // Shareholders
  const shData = {
    s1: [{ name: '陈老板', phone: '13800000001', ratio: 60 }, { name: '王股东', phone: '13800000002', ratio: 40 }],
    s2: [{ name: '陈老板', phone: '13800000001', ratio: 50 }, { name: '刘总', phone: '13800000003', ratio: 50 }],
    s3: [{ name: '陈老板', phone: '13800000001', ratio: 100 }]
  };
  for (const [sid, shs] of Object.entries(shData)) {
    await req('/stores/' + sid + '/shareholders', 'PUT', { shareholders: shs }, token);
  }
  console.log('Shareholders done');
  // Staff
  const staffData = [
    { sid: 's1', name: '张店长', phone: '13900000001', role: 'MANAGER', position: '店长', monthly_salary: 8000 },
    { sid: 's1', name: '李小明', phone: '13900000002', role: 'STAFF', position: '收银员', monthly_salary: 4500 },
    { sid: 's1', name: '王小红', phone: '13900000003', role: 'STAFF', position: '服务员', monthly_salary: 4000 },
    { sid: 's2', name: '赵店长', phone: '13900000004', role: 'MANAGER', position: '店长', monthly_salary: 7500 },
    { sid: 's2', name: '孙小美', phone: '13900000005', role: 'STAFF', position: '收银员', monthly_salary: 4500 },
    { sid: 's3', name: '周店长', phone: '13900000006', role: 'MANAGER', position: '店长', monthly_salary: 7000 },
    { sid: 's3', name: '吴小强', phone: '13900000007', role: 'STAFF', position: '服务员', monthly_salary: 3800 },
    { sid: 's3', name: '郑小芳', phone: '13900000008', role: 'STAFF', position: '收银员', monthly_salary: 4200 },
  ];
  for (const s of staffData) {
    const r = await req('/stores/' + s.sid + '/staff', 'POST', { ...s, password: '123456' }, token);
    if (r.error) console.log('Staff ' + s.name + ': ' + r.error);
  }
  console.log('Staff done');
  // Entries
  const now = new Date();
  for (const sid of ['s1', 's2', 's3']) {
    for (let m = 0; m < 3; m++) {
      const date = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const count = 10 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        const day = Math.floor(Math.random() * days) + 1;
        const ds = new Date(date.getFullYear(), date.getMonth(), day).toISOString().split('T')[0];
        const isIncome = Math.random() > 0.4;
        const cats = isIncome ? ['餐饮', '零售', '服务'] : ['原材料', '房租', '水电'];
        const cat = cats[Math.floor(Math.random() * cats.length)];
        const amt = isIncome ? Math.floor(Math.random() * 5000) + 500 : Math.floor(Math.random() * 3000) + 200;
        await req('/stores/' + sid + '/entries', 'POST', { type: isIncome ? 'income' : 'expense', category: cat, amount: amt, note: cat, date: ds }, token);
      }
    }
  }
  console.log('Entries done');
  // Verify
  const st = await req('/stores', 'GET', null, token);
  console.log('Total stores: ' + st.stores.length);
}
main().catch(console.error);
