"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-me-webhook-secret';
// POST /api/integrations/webhook/:provider — HMAC-SHA256 signature validation
router.post('/webhook/:provider', (0, auth_1.asyncHandler)(async (req, res) => {
    const provider = req.params.provider;
    const signature = req.headers['x-webhook-signature'];
    const rawBody = req.rawBody ?? JSON.stringify(req.body ?? {});
    const expected = 'sha256=' + crypto_1.default.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature ?? '');
    const expBuf = Buffer.from(expected);
    const valid = sigBuf.length === expBuf.length && crypto_1.default.timingSafeEqual(sigBuf, expBuf);
    if (!signature || !valid) {
        throw errors_1.err.forbidden('Invalid webhook signature');
    }
    // Update matching integration endpoint lastSync + recordsSynced
    const ep = await prisma_1.prisma.integrationEndpoint.findFirst({ where: { provider, deletedAt: null } });
    if (ep) {
        await prisma_1.prisma.integrationEndpoint.update({
            where: { id: ep.id },
            data: { lastSync: new Date().toISOString(), recordsSynced: { increment: 1 }, status: 'active', rev: { increment: 1 } },
        });
    }
    await (0, audit_1.writeAudit)({ operatorName: `webhook:${provider}`, ip: req.ip }, 'integration-endpoints', ep?.id ?? provider, 'UPDATE', null, { webhookReceived: true, provider });
    res.status(200).json({ received: true, provider });
}));
exports.default = router;
