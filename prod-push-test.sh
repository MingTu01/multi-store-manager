#!/bin/bash
# 生产端推送 token 保存测试脚本
# 在生产服务器上运行：bash prod-push-test.sh
# 会用 admin 账号测试完整保存流程

BASE="http://localhost:3001/api"
echo "========================================"
echo "  生产端推送 Token 保存测试"
echo "========================================"

# 1. 登录
echo ""
echo "=== 1. 登录 ==="
LOGIN_RESP=$(curl -s -c /tmp/cookies.txt -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
echo "登录响应: $LOGIN_RESP"

# 如果默认密码不对，提示
if echo "$LOGIN_RESP" | grep -q "错误"; then
  echo "默认密码不对，请修改脚本里的密码后重试"
  exit 1
fi

# 2. GET 初始设置
echo ""
echo "=== 2. GET 用户推送设置（保存前）==="
GET1=$(curl -s -b /tmp/cookies.txt "$BASE/system/user-notification-settings")
echo "当前 pushplus_token: $(echo "$GET1" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).pushplus_token||'(空)')}catch{console.log('解析失败')}})")"

# 3. PUT 保存 token
echo ""
echo "=== 3. PUT 保存 pushplus_token ==="
TEST_TOKEN="prod_test_$(date +%s)"
PUT_RESP=$(curl -s -b /tmp/cookies.txt -X PUT "$BASE/system/user-notification-settings" \
  -H "Content-Type: application/json" \
  -d "{\"pushplus_token\":\"$TEST_TOKEN\"}")
echo "PUT 响应: $PUT_RESP"
echo "期望保存的 token: $TEST_TOKEN"

# 4. GET 验证
echo ""
echo "=== 4. GET 验证 token 是否保存成功 ==="
GET2=$(curl -s -b /tmp/cookies.txt "$BASE/system/user-notification-settings")
SAVED_TOKEN=$(echo "$GET2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).pushplus_token||'(空)')}catch{console.log('解析失败')}})")
echo "实际读出的 token: $SAVED_TOKEN"

if [ "$SAVED_TOKEN" = "$TEST_TOKEN" ]; then
  echo ""
  echo "✓✓✓ 用户级 token 保存成功！后端正常 ✓✓✓"
  echo "问题在前端（浏览器缓存/JS未更新）"
else
  echo ""
  echo "✗✗✗ 用户级 token 保存失败！后端有问题 ✗✗✗"
fi

# 5. 全局设置测试
echo ""
echo "=== 5. 全局 notification-settings 测试 ==="
GETG=$(curl -s -b /tmp/cookies.txt "$BASE/system/notification-settings")
echo "全局当前 token: $(echo "$GETG" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).pushplus_token||'(空)')}catch{console.log('解析失败')}})")"

PUTG=$(curl -s -b /tmp/cookies.txt -X PUT "$BASE/system/notification-settings" \
  -H "Content-Type: application/json" \
  -d '{"pushplus_token":"global_prod_test_123"}')
echo "全局PUT响应: $PUTG"

GETG2=$(curl -s -b /tmp/cookies.txt "$BASE/system/notification-settings")
GLOBAL_SAVED=$(echo "$GETG2" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).pushplus_token||'(空)')}catch{console.log('解析失败')}})")
echo "全局保存后 token: $GLOBAL_SAVED"

if [ "$GLOBAL_SAVED" = "global_prod_test_123" ]; then
  echo "✓ 全局 token 保存成功"
else
  echo "✗ 全局 token 保存失败"
fi

# 6. 检查数据库实际存储
echo ""
echo "=== 6. 检查数据库实际存储（是否加密）==="
docker exec multi-shop-link node -e "
const db = require('better-sqlite3')('/app/data/store.db');
const u = db.prepare('SELECT pushplus_token FROM user_notification_settings WHERE user_id=1').get();
const g = db.prepare('SELECT pushplus_token FROM notification_settings WHERE id=1').get();
console.log('用户级密文:', u && u.pushplus_token ? u.pushplus_token.substring(0,30)+'...' : '(空)');
console.log('全局密文:', g && g.pushplus_token ? g.pushplus_token.substring(0,30)+'...' : '(空)');
console.log('用户级是密文?', u && u.pushplus_token && u.pushplus_token.includes(':') ? '是' : '否(明文或空)');
console.log('全局是密文?', g && g.pushplus_token && g.pushplus_token.includes(':') ? '是' : '否(明文或空)');
"

# 7. 清理测试数据
echo ""
echo "=== 7. 清理测试数据 ==="
curl -s -b /tmp/cookies.txt -X PUT "$BASE/system/user-notification-settings" \
  -H "Content-Type: application/json" -d '{"pushplus_token":""}' > /dev/null
curl -s -b /tmp/cookies.txt -X PUT "$BASE/system/notification-settings" \
  -H "Content-Type: application/json" -d '{"pushplus_token":""}' > /dev/null
echo "已清空测试 token"
rm -f /tmp/cookies.txt

echo ""
echo "========================================"
echo "  测试完成"
echo "========================================"
