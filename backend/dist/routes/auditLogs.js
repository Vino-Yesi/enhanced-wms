"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const router = (0, express_1.Router)();
// GET /api/audit-logs — admin + auditor. Filters: ?entity=, ?action=, ?operator=, ?from=, ?to=
router.get('/', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.AUDIT_READ), (0, auth_1.asyncHandler)(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 50));
    const sortDir = req.query.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const where = {};
    if (req.query.entity)
        where.entity = req.query.entity;
    if (req.query.action)
        where.action = req.query.action;
    if (req.query.operator)
        where.operatorName = { contains: req.query.operator };
    const createdAt = {};
    if (req.query.from)
        createdAt.gte = new Date(req.query.from);
    if (req.query.to)
        createdAt.lte = new Date(req.query.to);
    if (Object.keys(createdAt).length)
        where.createdAt = createdAt;
    const [total, rows] = await Promise.all([
        prisma_1.prisma.auditLog.count({ where }),
        prisma_1.prisma.auditLog.findMany({ where, orderBy: { createdAt: sortDir }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ data: rows, total, page, pageSize });
}));
// GET /api/audit-logs/:id
router.get('/:id', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.AUDIT_READ), (0, auth_1.asyncHandler)(async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id))
        throw errors_1.err.badRequest('Invalid id');
    const row = await prisma_1.prisma.auditLog.findUnique({ where: { id } });
    if (!row)
        throw errors_1.err.notFound('Audit log entry not found');
    res.json(row);
}));
exports.default = router;
