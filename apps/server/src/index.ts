if (!process.env.TZ) process.env.TZ = 'Asia/Shanghai';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'production';

import { app } from './app.js';
import { setupAutoBackup, setupCron } from './scheduler.js';
import { gracefulShutdown } from './shutdown.js';
import { initPush } from './push-notify.js';
import { eventBus } from './event-bus.js';
import logger from './logger.js';

const PORT = process.env.PORT || 3001;

// 启动定时任务
setupAutoBackup();
setupCron();

// 防止未处理错误导致服务器崩溃
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message);
  console.error('[FATAL] Stack:', err.stack);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

initPush();
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on http://0.0.0.0:' + PORT);
  setTimeout(() => {
    try {
      eventBus.broadcastSystem('server-ready');
      logger.info('[SSE] Broadcasted server-ready');
    } catch (e) { logger.info('[SSE] server-ready broadcast skipped:', (e as Error).message); }
  }, 1000);
})
  .on('error', (err: any) => {
    if (err.code === 'EACCES') {
      console.error('端口 ' + PORT + ' 无权限，请尝试其他端口 PORT=3000 node --import tsx src/index.ts');
    } else {
      console.error('服务器启动失败', err.message);
    }
    process.exit(1);
  });
