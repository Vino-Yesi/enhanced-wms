"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
const createSchema = zod_1.z.object({
    title: zod_1.z.string().min(1),
    body: zod_1.z.string().min(1),
    level: zod_1.z.enum(['info', 'warning', 'critical']).default('info'),
});
// GET /api/notifications — all authenticated
router.get('/', auth_1.authenticate, (0, auth_1.asyncHandler)(async (_req, res) => {
    const rows = await prisma_1.prisma.notification.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 100,
    });
    res.json(rows.map((r) => ({ ...r, acknowledgedBy: JSON.parse(r.acknowledgedBy || '[]') })));
}));
// POST /api/notifications — admin creates announcement
router.post('/', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.ADMIN_ONLY), (0, validate_1.validateBody)(createSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const { title, body, level } = req.body;
    const created = await prisma_1.prisma.notification.create({
        data: { title, body, level, createdBy: req.user.sub, acknowledgedBy: '[]', rev: 0 },
    });
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'notifications', created.id, 'CREATE', null, { title, level });
    res.status(201).json({ ...created, acknowledgedBy: [] });
}));
// POST /api/notifications/:id/ack — any authenticated user acknowledges
router.post('/:id/ack', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id))
        throw errors_1.err.badRequest('Invalid id');
    const existing = await prisma_1.prisma.notification.findUnique({ where: { id } });
    if (!existing || existing.deletedAt)
        throw errors_1.err.notFound('Notification not found');
    const acked = JSON.parse(existing.acknowledgedBy || '[]');
    const uid = req.user.sub;
    if (!acked.includes(uid))
        acked.push(uid);
    const updated = await prisma_1.prisma.notification.update({
        where: { id },
        data: { acknowledgedBy: JSON.stringify(acked), rev: { increment: 1 } },
    });
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'notifications', id, 'UPDATE', null, { acknowledgedBy: acked });
    res.json({ ...updated, acknowledgedBy: acked });
}));
exports.default = router;
