#!/bin/bash
# 生产端服务连通性诊断
echo "========================================"
echo "  生产端服务连通性诊断"
echo "========================================"

echo ""
echo "=== 1. 容器状态 ==="
docker ps | grep multi-shop

echo ""
echo "=== 2. 容器端口映射 ==="
docker port multi-shop-link

echo ""
echo "=== 3. 容器内 3001 端口监听 ==="
docker exec multi-shop-link sh -c "node -e \"const s=require('net').createServer();s.listen(3001,()=>{console.log('3001可监听');s.close()})\" 2>&1 || echo 'node不可用'"

echo ""
echo "=== 4. 容器内 health 检查 ==="
docker exec multi-shop-link node -e "fetch('http://localhost:3001/api/health').then(r=>r.text()).then(t=>console.log('health:',t)).catch(e=>console.log('失败:',e.message))" 2>&1

echo ""
echo "=== 5. 宿主机 curl 带详细错误信息 ==="
curl -v -m 5 http://localhost:3001/api/health 2>&1 | tail -20

echo ""
echo "=== 6. 看容器日志最近20行 ==="
docker logs multi-shop-link --tail 20 2>&1

echo ""
echo "=== 7. 容器内直接 curl ==="
docker exec multi-shop-link sh -c "curl -s http://localhost:3001/api/health 2>&1 || echo 'curl不可用，用node'" 
docker exec multi-shop-link node -e "const http=require('http');http.get('http://localhost:3001/api/health',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('容器内访问:',d))}).on('error',e=>console.log('失败:',e.message))" 2>&1

echo ""
echo "========================================"
echo "  诊断完成"
echo "========================================"
