"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const errors_1 = require("./lib/errors");
const validate_1 = require("./middleware/validate");
const rateLimit_1 = require("./middleware/rateLimit");
const resources_1 = require("./routes/resources");
const crudFactory_1 = require("./routes/crudFactory");
const auth_1 = __importDefault(require("./routes/auth"));
const sync_1 = __importDefault(require("./routes/sync"));
const dashboard_1 = __importDefault(require("./routes/dashboard"));
const alerts_1 = __importDefault(require("./routes/alerts"));
const inventoryTransfer_1 = __importDefault(require("./routes/inventoryTransfer"));
const labor_1 = __importDefault(require("./routes/labor"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const export_1 = __importDefault(require("./routes/export"));
const integrations_1 = __importDefault(require("./routes/integrations"));
const settings_1 = __importDefault(require("./routes/settings"));
const health_1 = __importDefault(require("./routes/health"));
const docs_1 = __importDefault(require("./routes/docs"));
const auditLogs_1 = __importDefault(require("./routes/auditLogs"));
function createApp() {
    const app = (0, express_1.default)();
    // Security headers (CSP tuned to allow Swagger UI inline assets)
    app.use((0, helmet_1.default)({
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
    }));
    // CORS: allow http://localhost:3000; * only in dev; configurable via CORS_ORIGIN
    const corsOrigin = process.env.CORS_ORIGIN ||
        (process.env.NODE_ENV === 'development' ? '*' : 'http://localhost:3000');
    app.use((0, cors_1.default)({ origin: corsOrigin, credentials: true }));
    // JSON body + capture raw body for webhook HMAC validation
    app.use(express_1.default.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf.toString(); } }));
    app.use(validate_1.sanitizeInput);
    const api = express_1.default.Router();
    // Health (no auth, no rate limit)
    api.use('/health', health_1.default);
    // Swagger UI at /api/docs (no auth required to view)
    api.use('/docs', docs_1.default);
    // Auth endpoints get the stricter limiter
    api.use('/auth', rateLimit_1.authLimiter, auth_1.default);
    // General API rate limit for everything else under /api
    api.use(rateLimit_1.apiLimiter);
    // Advanced endpoints
    api.use('/sync', sync_1.default);
    api.use('/dashboard', dashboard_1.default);
    api.use('/alerts', alerts_1.default);
    api.use('/inventory', inventoryTransfer_1.default); // POST /inventory/transfer (mounted before crud /inventory to avoid :id collision? No — transfer is a sub-path; crud router handles /inventory and /inventory/:id. POST /inventory/transfer would match POST /inventory/:id with id='transfer'. So I must mount transfer BEFORE the crud inventory router, OR handle inside. I'll mount inventoryTransfer at /inventory/transfer before crud. But crud router is mounted at /inventory. POST /inventory/transfer → crud router sees POST /:id → id='transfer' → parseInt NaN → 400. So mount transfer router first at /inventory. Order matters. I'll mount inventoryTransferRoutes at '/inventory' BEFORE the crud inventory router. But both at /inventory — the transfer router defines POST /transfer, so combined. Let me mount it here before the loop, and in the loop skip mounting crud for 'inventory'? No — I still need crud for inventory. Mount inventoryTransfer at /inventory first; then in loop, crud for inventory also mounts at /inventory. Express matches in order: POST /inventory/transfer hits transfer router's POST /transfer → handled. Good.
    api.use('/labor', labor_1.default);
    api.use('/notifications', notifications_1.default);
    api.use('/export', export_1.default);
    api.use('/integrations', integrations_1.default);
    api.use('/settings', settings_1.default);
    // Audit logs (read-only, dedicated router — no tombstone columns)
    api.use('/audit-logs', auditLogs_1.default);
    // REST CRUD for all resources (audit-logs handled above)
    for (const cfg of resources_1.RESOURCES) {
        if (cfg.path === 'audit-logs')
            continue;
        api.use(`/${cfg.path}`, (0, crudFactory_1.buildCrudRouter)(cfg));
    }
    // 404 for unknown /api routes
    api.use((_req, _res, next) => next(errors_1.err.notFound('Endpoint not found')));
    app.use('/api', api);
    // Global error handler (never leaks stack traces)
    app.use(errors_1.errorHandler);
    return app;
}
