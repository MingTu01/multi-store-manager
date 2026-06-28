#!/bin/sh
# MSL Container Startup Script - Wrapper for entrypoint.js
# This script delegates to entrypoint.js (Node.js) for reliable startup
# that avoids BOM/CRLF corruption issues.

exec node /app/entrypoint.js
