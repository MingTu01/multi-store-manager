module.exports = {
  apps: [{
    name: 'multi-store-manager',
    script: 'apps/server/src/index.ts',
    interpreter: 'node',
    interpreter_args: '--import tsx',
    cwd: './apps/server',
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/app.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 3000
  }]
};
