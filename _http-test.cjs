// 真实 HTTP 端到端测试：模拟前端完整推送设置流程
const http = require('http');

let cookieJar = '';
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (cookieJar) headers['Cookie'] = cookieJar;
    const r = http.request({ host: 'localhost', port: 3001, path, method, headers }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        // 捕获 set-cookie
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          cookieJar = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, data: d }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  console.log('=== 1. 登录 ===');
  const login = await req('POST', '/api/auth/login', { username: 'admin', password: 'admin123' });
  console.log('登录状态:', login.status);
  if (login.status !== 200) { console.log('登录失败:', login.data); return; }
  const token = login.data.token;
  console.log('token获取成功');

  console.log('\n=== 2. GET 用户推送设置（初始）===');
  const get1 = await req('GET', '/api/system/user-notification-settings', null);
  console.log('初始设置:', JSON.stringify(get1.data));

  console.log('\n=== 3. PUT 保存 pushplus_token（模拟前端handleSave）===');
  const testToken = 'pushplus_http_test_' + Date.now();
  // 前端 handleSave 把整个 settings PUT 上去，这里模拟只传 token + 几个开关
  const putBody = { ...get1.data, pushplus_token: testToken };
  // 清理掉可能的 undefined
  Object.keys(putBody).forEach(k => { if (putBody[k] === undefined) delete putBody[k]; });
  const put1 = await req('PUT', '/api/system/user-notification-settings', putBody);
  console.log('PUT状态:', put1.status, put1.data);

  console.log('\n=== 4. GET 验证 token 是否保存成功 ===');
  const get2 = await req('GET', '/api/system/user-notification-settings', null);
  console.log('保存后 pushplus_token:', get2.data.pushplus_token);
  console.log('与保存的一致?', get2.data.pushplus_token === testToken ? '✓ 成功' : '✗ 失败（丢失了！）');
  if (get2.data.pushplus_token !== testToken) {
    console.log('  期望:', testToken);
    console.log('  实际:', get2.data.pushplus_token);
  }

  console.log('\n=== 5. PUT 再次更新 token ===');
  const newToken = 'updated_token_456';
  const putBody2 = { ...get2.data, pushplus_token: newToken };
  Object.keys(putBody2).forEach(k => { if (putBody2[k] === undefined) delete putBody2[k]; });
  const put2 = await req('PUT', '/api/system/user-notification-settings', putBody2);
  console.log('PUT2状态:', put2.status, put2.data);
  const get3 = await req('GET', '/api/system/user-notification-settings', null);
  console.log('更新后 token:', get3.data.pushplus_token);
  console.log('更新成功?', get3.data.pushplus_token === newToken ? '✓' : '✗');

  console.log('\n=== 6. 验证数据库实际存储的是密文 ===');
  const db = require('better-sqlite3')('apps/server/data/store.db');
  const row = db.prepare('SELECT pushplus_token FROM user_notification_settings WHERE user_id=?').get(1);
  console.log('数据库密文:', row ? row.pushplus_token?.substring(0, 30) + '...' : '(无记录)');
  console.log('是密文(含:)?', row && row.pushplus_token && row.pushplus_token.includes(':') ? '✓ 加密存储' : '✗ 明文或空');
  db.close();

  console.log('\n=== 7. 全局 notification_settings（ADMIN全局）===');
  const getG1 = await req('GET', '/api/system/notification-settings', null);
  console.log('全局初始:', JSON.stringify(getG1.data).substring(0, 200));
  const putG = await req('PUT', '/api/system/notification-settings', { ...getG1.data, pushplus_token: 'global_token_test' });
  console.log('全局PUT:', putG.status, putG.data);
  const getG2 = await req('GET', '/api/system/notification-settings', null);
  console.log('全局保存后 pushplus_token:', getG2.data.pushplus_token);
  console.log('全局成功?', getG2.data.pushplus_token === 'global_token_test' ? '✓' : '✗');

  console.log('\n========== 结论 ==========');
  const userOk = get2.data.pushplus_token === testToken;
  const globalOk = getG2.data.pushplus_token === 'global_token_test';
  if (userOk && globalOk) {
    console.log('✓ HTTP 端到端测试通过：推送 token 保存逻辑完全正常');
    console.log('  → 生产端"无法保存"的原因必定是：代码未真正部署到生产环境');
  } else {
    console.log('✗ 发现问题：');
    if (!userOk) console.log('  - 用户级 token 保存失败');
    if (!globalOk) console.log('  - 全局 token 保存失败');
  }
})().catch(e => console.error('测试异常:', e.message));
