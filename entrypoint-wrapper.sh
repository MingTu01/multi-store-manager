#!/bin/sh
set -e
echo '[Startup] Running startup check...'
node /app/startup-check.js 2>&1 || true
echo '[Startup] Starting server...'
exec node --import tsx src/index.ts
