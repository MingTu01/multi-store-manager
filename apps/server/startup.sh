#!/bin/sh
# MSL Container Startup Script

echo ""
echo "========================================"
echo "  MSL Container Starting..."
echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo "  TZ: ${TZ:-not set}"
echo "  Node: $(node -v)"
echo "========================================"
echo ""

# Run startup diagnostic
echo "[Startup] Running diagnostic checks..."
node /app/startup-check.js 2>&1 || true
echo ""

# Determine if npm install is needed
NEED_INSTALL=0

if [ ! -d "/app/node_modules" ]; then
  echo "[Startup] node_modules missing"
  NEED_INSTALL=1
elif [ ! -d "/app/node_modules/tsx" ]; then
  echo "[Startup] Critical dependency tsx missing"
  NEED_INSTALL=1
elif [ ! -d "/app/node_modules/express" ]; then
  echo "[Startup] Critical dependency express missing"
  NEED_INSTALL=1
elif [ ! -d "/app/node_modules/better-sqlite3" ]; then
  echo "[Startup] Critical dependency better-sqlite3 missing"
  NEED_INSTALL=1
fi

if [ "$NEED_INSTALL" = "1" ]; then
  echo "[Startup] Running npm install..."
  npm install --registry=https://registry.npmmirror.com 2>&1
  echo "[Startup] npm install completed"
else
  echo "[Startup] node_modules OK, skipping npm install"
fi

echo ""
echo "[Startup] Starting application..."
echo ""

exec node --import tsx src/index.ts