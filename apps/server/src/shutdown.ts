import db from './db.js';
import { eventBus } from './event-bus.js';

// Graceful shutdown
export function gracefulShutdown(signal: string) {
  console.log('[Signal] Received ' + signal + ', starting graceful shutdown...');

  // 1. Notify SSE clients
  try {
    eventBus.broadcastSystem('server-shutdown');
  } catch {}

  // 2. Force exit after timeout
  const forceExit = setTimeout(() => {
    console.log('[Shutdown] Force exit after 10s timeout');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  // 3. Close database
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[Shutdown] Database closed');
  } catch (e) {
    console.error('[Shutdown] DB close error:', (e as Error).message);
  }

  console.log('[Shutdown] Cleanup complete');
  process.exit(0);
}
