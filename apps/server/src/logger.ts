// apps/server/src/logger.ts
// Structured logging module using pino

import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const logger = pino({
  level,
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
  formatters: {
    level(label: string) { return { level: label }; },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

export default logger;
