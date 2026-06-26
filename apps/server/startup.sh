#!/bin/sh
# MSL Container Startup Script
# Runs diagnostic checks before starting the application

echo ""
echo "========================================"
echo "  MSL Container Starting..."
echo "  Time: $(date)"
echo "  TZ: ${TZ:-not set}"
echo "  Node: $(node -v)"
echo "  NPM: $(npm -v)"
echo "========================================"
echo ""

# Run startup diagnostic (non-blocking, auto-repair)
echo "[Startup] Running diagnostic checks..."
node /app/startup-check.js 2>&1
DIAG_EXIT=$?

echo ""
echo "[Startup] Diagnostic completed (exit: $DIAG_EXIT)"
echo ""

# Check if node_modules needs install
if [ ! -d "/app/node_modules" ]; then
  echo "[Startup] node_modules missing, running npm install..."
  npm install 2>&1
  echo "[Startup] npm install completed"
else
  # Check if package.json changed since last install
  if [ -f "/app/node_modules/.package-lock.json" ]; then
    if [ "/app/package.json" -nt "/app/node_modules/.package-lock.json" ]; then
      echo "[Startup] package.json changed, running npm install..."
      npm install 2>&1
      echo "[Startup] npm install completed"
    else
      if [ ! -d "/app/node_modules/tsx" ]; then
  echo "[Startup] Critical dependency tsx missing, running npm install..."
  npm install 2>&1
  echo "[Startup] npm install completed"
else
  echo "[Startup] node_modules up to date, skipping npm install"
fi
    fi
  else
    echo "[Startup] No lock marker found, verifying node_modules..."
    if [ -d "/app/node_modules/better-sqlite3" ] && [ -d "/app/node_modules/express" ]; then
      echo "[Startup] node_modules looks OK"
    if [ ! -d "/app/node_modules/tsx" ]; then
      echo "[Startup] Critical dependency tsx missing, running npm install..."
      npm install 2>&1
      echo "[Startup] npm install completed"
    fi
    else
      echo "[Startup] node_modules incomplete, running npm install..."
      npm install 2>&1
      echo "[Startup] npm install completed"
    fi
  fi
fi

echo ""
echo "[Startup] Starting application..."
echo ""

# Start the actual application
exec node --import tsx src/index.ts
