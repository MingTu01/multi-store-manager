import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import { existsSync } from 'fs';
import { authMiddleware } from './auth.js';
import authRouter from './routes/auth.js';
import storesRouter from './routes/stores.js';
import entriesRouter from './routes/entries.js';
import categoriesRouter from './routes/categories.js';
import reportRouter from './routes/report.js';
import notificationsRouter from './routes/notifications.js';
import usersRouter from './routes/users.js';
import inventoryRouter from './routes/inventory.js';
import handoversRouter from './routes/handovers.js';
import shiftsRouter from './routes/shifts.js';
import dividendsRouter from './routes/dividends.js';
import payrollRouter from './routes/payroll.js';
import systemRouter from './routes/system.js';
import logsRouter from './routes/logs.js';
import reportsRouter from './routes/reports.js';
import dashboardRouter from './routes/dashboard.js';
import healthCertRouter from './routes/health-cert.js';
import purchaseRouter from './routes/purchase.js';
import uploadRouter from './routes/upload.js';
import { startHealthCheckScheduler } from './health-check-scheduler.js';
import { requireStoreAccess } from './middleware/store-access.js';
import { eventBus } from './event-bus.js';
import { requestLogger } from './request-logger.js';
import { AppError } from './error-handler.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const BASE_DIR = join(__dirname, '..');

const app = express();
app.set('trust proxy', 1);

// S7: CORS 配置
const corsOrigin = process.env.CORS_ORIGIN || '';
const corsOptions: cors.CorsOptions = {
  origin: corsOrigin
    ? corsOrigin.split(',').map(s => s.trim())
    : false,
  credentials: !!corsOrigin
};

app.use(requestLogger);
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers.accept === 'text/event-stream') return false;
    return compression.filter(req, res);
  }
}));

// 安全HTTP头
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.removeHeader('X-Powered-By');
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '));
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

app.use(cors(corsOptions));

// P5: JSON body 大小限制可配置
const jsonLimit = process.env.JSON_LIMIT || '5mb';
app.use(express.json({ limit: jsonLimit }));

// Security: Global rate limit
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: false,
  legacyHeaders: false,
  message: '请求过于频繁，请稍后重试',
  skip: (req) => {
    if (!req.path.startsWith('/api/')) return true;
    if (req.path === '/api/sse') return true;
    return false;
  }
});
app.use(globalLimiter);

// 智能检测前端构建产物路径
const POSSIBLE_WEB_DIST = [
  join(BASE_DIR, 'public', 'web-dist'),
  join(BASE_DIR, '..', 'public', 'web-dist'),
  join(BASE_DIR, '..', 'apps', 'server', 'public', 'web-dist'),
  join(BASE_DIR, 'web', 'dist'),
  join(BASE_DIR, '..', 'web', 'dist'),
  join(BASE_DIR, '..', '..', 'web', 'dist'),
  join(BASE_DIR, '..', '..', 'apps', 'web', 'dist'),
  join('/app', 'public', 'web-dist'),
  join('/app', 'apps', 'web', 'dist'),
];
export const WEB_DIST_PATH = POSSIBLE_WEB_DIST.find(p => existsSync(join(p, 'index.html'))) || POSSIBLE_WEB_DIST[0];
app.use(express.static(WEB_DIST_PATH, {
    maxAge: '1h',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      } else if (path.match(/\.(js|css|woff2?|ttf|eot)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      } else if (path.match(/\.(png|jpe?g|gif|svg|webp|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=2592000');
      }
    }
  }));
app.use(express.static(join(BASE_DIR, 'public')));
app.use('/uploads', authMiddleware, express.static(join(BASE_DIR, 'uploads'), { maxAge: '30d', etag: true }));

// Health check (no auth)
app.get('/api/health', (_req, res) => { res.json({ status: 'ok', ts: Date.now() }); });

// SSE - Server-Sent Events for real-time data push
app.get('/api/sse', authMiddleware, (req, res) => {
  const userId = (req as any).user?.id || 0;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const role = (req as any).user?.role || 'STAFF';
  const storeId = (req as any).user?.store_id || null;
  const clientId = eventBus.addClient(userId, role, storeId, res);
  if (!clientId) {
    res.status(429).json({ error: 'SSE 连接数超限，请稍后重试' });
    return;
  }

  const heartbeat = setInterval(() => {
    try { res.write('data: {"type":"heartbeat","ts":' + Date.now() + '}\n\n'); } catch {}
  }, 15000);

  res.write('data: {"type":"connected","ts":' + Date.now() + '}\n\n');

  req.on('close', () => { clearInterval(heartbeat); eventBus.removeClient(clientId); });
});

// Export eventBus for use in routes
export { eventBus };

// 路由挂载
app.use('/api/auth', authRouter);
app.use('/api/stores', authMiddleware, storesRouter);
app.use('/api/stores/:storeId/entries', authMiddleware, requireStoreAccess, entriesRouter);
app.use('/api/stores/:storeId/categories', authMiddleware, requireStoreAccess, categoriesRouter);
app.use('/api/stores/:storeId/inventory', authMiddleware, requireStoreAccess, inventoryRouter);
app.use('/api/stores/:storeId/handovers', authMiddleware, requireStoreAccess, handoversRouter);
app.use('/api/stores/:storeId/shifts', authMiddleware, requireStoreAccess, shiftsRouter);
app.use('/api/stores/:storeId/dividends', authMiddleware, requireStoreAccess, dividendsRouter);
app.use('/api/stores/:storeId/payrolls', authMiddleware, requireStoreAccess, payrollRouter);
app.use('/api/stores/:storeId/report', authMiddleware, requireStoreAccess, reportRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api/system', authMiddleware, systemRouter);
app.use('/api/logs', authMiddleware, logsRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
startHealthCheckScheduler();
app.use('/api/health-cert', authMiddleware, healthCertRouter);
app.use('/api/stores/:storeId/purchase', authMiddleware, requireStoreAccess, purchaseRouter);
app.use('/api/upload', authMiddleware, uploadRouter);

// SPA fallback
app.get('{*splat}', (req, res) => {
  if (req.path.startsWith('/assets/') || req.path.startsWith('/api/')) return res.status(404).send('Not found');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(join(WEB_DIST_PATH, 'index.html'));
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  const requestId = (req as any).requestId || '-';
  const isProd = process.env.NODE_ENV === 'production';

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: '文件大小超过限制 (最大 5MB)' });
  }

  if (err instanceof AppError) {
    logger.error({ requestId, errorCode: err.errorCode, message: err.message }, 'AppError');
    return res.status(err.httpStatus).json(err.toJSON(isProd));
  }

  logger.error({ requestId, method: req.method, path: req.path, error: err.message }, 'Unhandled ERROR');
  res.status(err.status || 500).json({
    error: isProd ? '服务器内部错误' : (err.message || '服务器内部错误'),
    code: 'SRV_001'
  });
});

export { app };
