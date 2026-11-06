"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
// GET /api/settings — all authenticated can read global settings
router.get('/', auth_1.authenticate, (0, auth_1.asyncHandler)(async (_req, res) => {
    const rows = await prisma_1.prisma.setting.findMany();
    const out = {};
    for (const r of rows)
        out[r.key] = r.value;
    res.json(out);
}));
// PUT /api/settings — admin only, merge key/values
router.put('/', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ONLY), (0, auth_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body))
        throw errors_1.err.badRequest('Body must be a key/value object');
    for (const [key, value] of Object.entries(body)) {
        await prisma_1.prisma.setting.upsert({
            where: { key },
            create: { key, value: String(value) },
            update: { value: String(value) },
        });
    }
    const rows = await prisma_1.prisma.setting.findMany();
    const out = {};
    for (const r of rows)
        out[r.key] = r.value;
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'settings', undefined, 'UPDATE', null, body);
    res.json(out);
}));
exports.default = router;
