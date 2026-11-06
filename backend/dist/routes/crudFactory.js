"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCrudRouter = buildCrudRouter;
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const RESERVED = new Set(['q', 'page', 'pageSize', 'sortBy', 'sortDir', 'includeDeleted']);
function stripSensitive(row, cfg) {
    if (!row)
        return row;
    const out = { ...row };
    for (const f of cfg.sensitiveFields ?? [])
        delete out[f];
    return out;
}
function buildCrudRouter(cfg) {
    const router = (0, express_1.Router)();
    const delegate = () => prisma_1.prisma[cfg.model];
    // ── LIST ───────────────────────────────────────────────────────────
    router.get('/', auth_1.authenticate, (0, auth_1.requireRole)(...cfg.readRoles), (0, auth_1.asyncHandler)(async (req, res) => {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize) || 50));
        const q = req.query.q?.trim();
        const sortBy = req.query.sortBy || 'updatedAt';
        const sortDir = req.query.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
        const includeDeleted = req.query.includeDeleted === '1';
        const where = {};
        if (!includeDeleted)
            where.deletedAt = null;
        if (q && cfg.searchFields.length) {
            where.OR = cfg.searchFields.map((f) => ({ [f]: { contains: q } }));
        }
        // Entity-specific filters: any other query param = equality filter
        for (const [key, val] of Object.entries(req.query)) {
            if (RESERVED.has(key))
                continue;
            if (typeof val === 'string' && val !== '')
                where[key] = val;
        }
        const [total, rows] = await Promise.all([
            delegate().count({ where }),
            delegate().findMany({
                where,
                orderBy: { [sortBy]: sortDir },
                skip: (page - 1) * pageSize,
                take: pageSize,
            }),
        ]);
        const data = rows.map((r) => {
            const out = stripSensitive(r, cfg);
            if (cfg.listOmit)
                for (const f of cfg.listOmit) {
                    if (out[f] && typeof out[f] === 'string' && out[f].length > 64)
                        out[f] = out[f].slice(0, 64) + '…[truncated]';
                }
            return out;
        });
        res.json({ data, total, page, pageSize });
    }));
    // ── GET single ─────────────────────────────────────────────────────
    router.get('/:id', auth_1.authenticate, (0, auth_1.requireRole)(...cfg.readRoles), (0, auth_1.asyncHandler)(async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            throw errors_1.err.badRequest('Invalid id');
        const row = await delegate().findUnique({ where: { id } });
        if (!row || (row.deletedAt && req.query.includeDeleted !== '1'))
            throw errors_1.err.notFound(`${cfg.path} not found`);
        res.json(stripSensitive(row, cfg));
    }));
    if (cfg.readOnly)
        return router;
    // ── CREATE ─────────────────────────────────────────────────────────
    router.post('/', auth_1.authenticate, (0, auth_1.requireRole)(...cfg.writeRoles), (0, validate_1.validateBody)(cfg.schema), (0, auth_1.asyncHandler)(async (req, res) => {
        let data = { ...req.body };
        delete data.id;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.deletedAt;
        delete data.rev;
        if (cfg.adminOnly && data.password) {
            const { hashPassword } = require('../lib/password');
            data.password = await hashPassword(data.password);
        }
        const created = await delegate().create({ data: { ...data, rev: 0 } });
        await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), cfg.label, created.id, 'CREATE', null, stripSensitive(created, cfg));
        res.status(201).json(stripSensitive(created, cfg));
    }));
    if (cfg.appendOnly)
        return router;
    // ── UPDATE ─────────────────────────────────────────────────────────
    router.put('/:id', auth_1.authenticate, (0, auth_1.requireRole)(...cfg.writeRoles), (0, validate_1.validateBody)(cfg.schema.partial()), (0, auth_1.asyncHandler)(async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            throw errors_1.err.badRequest('Invalid id');
        const existing = await delegate().findUnique({ where: { id } });
        if (!existing || existing.deletedAt)
            throw errors_1.err.notFound(`${cfg.path} not found`);
        let data = { ...req.body };
        delete data.id;
        delete data.createdAt;
        delete data.updatedAt;
        delete data.deletedAt;
        delete data.rev;
        if (cfg.adminOnly && data.password) {
            const { hashPassword } = require('../lib/password');
            data.password = await hashPassword(data.password);
        }
        const updated = await delegate().update({
            where: { id },
            data: { ...data, rev: { increment: 1 } },
        });
        await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), cfg.label, id, 'UPDATE', stripSensitive(existing, cfg), stripSensitive(updated, cfg));
        res.json(stripSensitive(updated, cfg));
    }));
    // ── DELETE (soft / tombstone) ──────────────────────────────────────
    router.delete('/:id', auth_1.authenticate, (0, auth_1.requireRole)(...cfg.deleteRoles), (0, auth_1.asyncHandler)(async (req, res) => {
        const id = parseInt(req.params.id);
        if (isNaN(id))
            throw errors_1.err.badRequest('Invalid id');
        const existing = await delegate().findUnique({ where: { id } });
        if (!existing || existing.deletedAt)
            throw errors_1.err.notFound(`${cfg.path} not found`);
        const updated = await delegate().update({
            where: { id },
            data: { deletedAt: new Date(), rev: { increment: 1 } },
        });
        await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), cfg.label, id, 'DELETE', stripSensitive(existing, cfg), null);
        res.json(stripSensitive(updated, cfg));
    }));
    return router;
}
