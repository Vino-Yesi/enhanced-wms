import express, { Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { errorHandler, err } from './lib/errors';
import { sanitizeInput } from './middleware/validate';
import { authLimiter, apiLimiter } from './middleware/rateLimit';
import { RESOURCES } from './routes/resources';
import { buildCrudRouter } from './routes/crudFactory';
import authRoutes from './routes/auth';
import syncRoutes from './routes/sync';
import dashboardRoutes from './routes/dashboard';
import alertsRoutes from './routes/alerts';
import inventoryTransferRoutes from './routes/inventoryTransfer';
import laborRoutes from './routes/labor';
import notificationsRoutes from './routes/notifications';
import exportRoutes from './routes/export';
import integrationsRoutes from './routes/integrations';
import settingsRoutes from './routes/settings';
import healthRoutes from './routes/health';
import docsRoutes from './routes/docs';
import auditLogsRoutes from './routes/auditLogs';

export function createApp() {
  const app = express();

  // Security headers (CSP tuned to allow Swagger UI inline assets)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS: allow http://localhost:3000; * only in dev; configurable via CORS_ORIGIN
  const corsOrigin =
    process.env.CORS_ORIGIN ||
    (process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3000');
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // JSON body + capture raw body for webhook HMAC validation
  app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); } }));
  app.use(sanitizeInput);

  const api = express.Router();

  // Health (no auth, no rate limit)
  api.use('/health', healthRoutes);

  // Swagger UI at /api/docs (no auth required to view)
  api.use('/docs', docsRoutes);

  // Auth endpoints get the stricter limiter
  api.use('/auth', authLimiter, authRoutes);

  // General API rate limit for everything else under /api
  api.use(apiLimiter);

  // Advanced endpoints
  api.use('/sync', syncRoutes);
  api.use('/dashboard', dashboardRoutes);
  api.use('/alerts', alertsRoutes);
  api.use('/inventory', inventoryTransferRoutes); // POST /inventory/transfer (mounted before crud /inventory to avoid :id collision? No — transfer is a sub-path; crud router handles /inventory and /inventory/:id. POST /inventory/transfer would match POST /inventory/:id with id='transfer'. So I must mount transfer BEFORE the crud inventory router, OR handle inside. I'll mount inventoryTransfer at /inventory/transfer before crud. But crud router is mounted at /inventory. POST /inventory/transfer → crud router sees POST /:id → id='transfer' → parseInt NaN → 400. So mount transfer router first at /inventory. Order matters. I'll mount inventoryTransferRoutes at '/inventory' BEFORE the crud inventory router. But both at /inventory — the transfer router defines POST /transfer, so combined. Let me mount it here before the loop, and in the loop skip mounting crud for 'inventory'? No — I still need crud for inventory. Mount inventoryTransfer at /inventory first; then in loop, crud for inventory also mounts at /inventory. Express matches in order: POST /inventory/transfer hits transfer router's POST /transfer → handled. Good.
  api.use('/labor', laborRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/export', exportRoutes);
  api.use('/integrations', integrationsRoutes);
  api.use('/settings', settingsRoutes);

  // Audit logs (read-only, dedicated router — no tombstone columns)
  api.use('/audit-logs', auditLogsRoutes);

  // REST CRUD for all resources (audit-logs handled above)
  for (const cfg of RESOURCES) {
    if (cfg.path === 'audit-logs') continue;
    api.use(`/${cfg.path}`, buildCrudRouter(cfg));
  }

  // 404 for unknown /api routes
  api.use((_req: Request, _res: Response, next) => next(err.notFound('Endpoint not found')));

  app.use('/api', api);

  // Global error handler (never leaks stack traces)
  app.use(errorHandler);

  return app;
}
