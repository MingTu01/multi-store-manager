#!/bin/bash
# Multi Shop Link - One-click Deployment
# 适用于 CentOS + 1Panel 环境
# 使用方法：chmod +x deploy.sh && ./deploy.sh

set -e

APP_NAME="multi-shop-link"
APP_DIR="/opt/${APP_NAME}"
PORT=3001

echo "=========================================="
echo "  Multi Shop Link - One-click Deployment"
echo "=========================================="

# 1. 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[安装] Node.js 18+..."
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
fi
echo "Node.js: $(node -v)"
echo "npm: $(npm -v)"

# 2. 安装 PM2
if ! command -v pm2 &> /dev/null; then
    echo "[安装] PM2..."
    npm install -g pm2
fi

# 3. 创建目录
mkdir -p ${APP_DIR}
mkdir -p ${APP_DIR}/apps/server/data
mkdir -p ${APP_DIR}/apps/server/backups
mkdir -p ${APP_DIR}/apps/server/uploads
mkdir -p ${APP_DIR}/logs

# 4. 解压部署包
if [ -f "$1" ]; then
    echo "[部署] 解压 $1..."
    # 备份数据库
    if [ -f "${APP_DIR}/apps/server/data/store.db" ]; then
        cp ${APP_DIR}/apps/server/data/store.db ${APP_DIR}/apps/server/data/store.db.bak
        echo "[备份] 数据库已备份"
    fi
    # 解压（保留数据目录）
    tar -czf /tmp/${APP_NAME}-data-backup.tar.gz -C ${APP_DIR} apps/server/data apps/server/backups apps/server/uploads 2>/dev/null || true
    unzip -o "$1" -d ${APP_DIR}
    # 恢复数据
    tar -xzf /tmp/${APP_NAME}-data-backup.tar.gz -C ${APP_DIR} 2>/dev/null || true
    echo "[部署] 解压完成"
else
    echo "[错误] 请提供ZIP部署包: ./deploy.sh <package.zip>"
    exit 1
fi

# 5. 安装依赖
echo "[安装] 后端依赖..."
cd ${APP_DIR}/apps/server && npm install --production
echo "[安装] 前端构建..."
cd ${APP_DIR}/apps/web && npm install && npm run build

# 6. PM2 管理
cd ${APP_DIR}
# 停止旧进程
pm2 delete ${APP_NAME} 2>/dev/null || true
# 启动新进程
pm2 start apps/server/src/index.ts \
    --name ${APP_NAME} \
    --interpreter "node" \
    --interpreter-args "--import tsx" \
    --cwd ${APP_DIR}/apps/server \
    --max-memory-restart 512M \
    --log ${APP_DIR}/logs/app.log \
    --error ${APP_DIR}/logs/error.log \
    --time

# 保存 PM2 进程列表（开机自启）
pm2 save
pm2 startup

echo ""
echo "=========================================="
echo "  部署完成！"
echo "  访问: http://localhost:${PORT}"
echo "  PM2 状态: pm2 status"
echo "  查看日志: pm2 logs ${APP_NAME}"
echo "=========================================="
