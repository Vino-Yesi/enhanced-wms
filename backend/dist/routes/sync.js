"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const resources_1 = require("./resources");
const router = (0, express_1.Router)();
const SYNC_EXCLUDE = new Set(['audit-logs', 'users']);
const SYNCABLE = Object.values(resources_1.RESOURCE_MAP).filter((r) => !SYNC_EXCLUDE.has(r.path));
const PER_RESOURCE_CAP = 2000;
function parsePullPositions(raw) {
    if (raw === undefined)
        return undefined;
    if (typeof raw !== 'string')
        throw errors_1.err.badRequest('Invalid `continuation` cursor');
    let value;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw errors_1.err.badRequest('Invalid `continuation` cursor');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw errors_1.err.badRequest('Invalid `continuation` cursor');
    }
    const positions = {};
    for (const [resource, position] of Object.entries(value)) {
        if (position === null) {
            positions[resource] = null;
            continue;
        }
        if (!position || typeof position !== 'object' || Array.isArray(position)) {
            throw errors_1.err.badRequest('Invalid `continuation` cursor');
        }
        const candidate = position;
        const updatedAt = new Date(String(candidate.updatedAt));
        if (!Number.isFinite(updatedAt.getTime()) ||
            typeof candidate.id !== 'number' ||
            !Number.isInteger(candidate.id) ||
            candidate.id < 1) {
            throw errors_1.err.badRequest('Invalid `continuation` cursor');
        }
        positions[resource] = { updatedAt: updatedAt.toISOString(), id: candidate.id };
    }
    return positions;
}
// GET /api/sync/pull?since=<ISO>&resources=a,b
router.get('/pull', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const sinceRaw = req.query.since || '1970-01-01T00:00:00.000Z';
    const since = new Date(sinceRaw);
    if (!Number.isFinite(since.getTime()))
        throw errors_1.err.badRequest('Invalid `since` timestamp');
    const untilRaw = req.query.until;
    const until = untilRaw ? new Date(untilRaw) : new Date();
    if (!Number.isFinite(until.getTime()) || until < since)
        throw errors_1.err.badRequest('Invalid `until` timestamp');
    const requested = req.query.resources?.split(',').map((s) => s.trim()).filter(Boolean);
    const targets = requested ? SYNCABLE.filter((r) => requested.includes(r.path)) : SYNCABLE;
    const positions = parsePullPositions(req.query.continuation);
    const changes = {};
    const continuation = {};
    let hasMore = false;
    for (const cfg of targets) {
        if (positions && Object.prototype.hasOwnProperty.call(positions, cfg.path) && positions[cfg.path] === null) {
            continuation[cfg.path] = null;
            continue;
        }
        const delegate = prisma_1.prisma[cfg.model];
        if (!delegate)
            continue;
        const changedInWindow = {
            OR: [
                { updatedAt: { gt: since, lte: until } },
                { deletedAt: { gt: since, lte: until } },
            ],
        };
        const position = positions?.[cfg.path];
        const where = position
            ? {
                AND: [
                    changedInWindow,
                    {
                        OR: [
                            { updatedAt: { gt: new Date(position.updatedAt) } },
                            { updatedAt: new Date(position.updatedAt), id: { gt: position.id } },
                        ],
                    },
                ],
            }
            : changedInWindow;
        const rows = await delegate.findMany({
            where,
            orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
            take: PER_RESOURCE_CAP + 1,
        });
        const page = rows.slice(0, PER_RESOURCE_CAP);
        if (rows.length > PER_RESOURCE_CAP) {
            hasMore = true;
            const last = page[page.length - 1];
            continuation[cfg.path] = { updatedAt: last.updatedAt.toISOString(), id: last.id };
        }
        else {
            continuation[cfg.path] = null;
        }
        const trimmed = page.map((row) => {
            const out = { ...row };
            for (const field of cfg.sensitiveFields ?? [])
                delete out[field];
            out._op = row.deletedAt ? 'delete' : 'upsert';
            return out;
        });
        if (trimmed.length)
            changes[cfg.path] = trimmed;
    }
    res.json({
        cursor: until.toISOString(),
        changes,
        hasMore,
        ...(hasMore ? { continuation } : {}),
    });
}));
// POST /api/sync/push — enforces the same per-resource write policy as CRUD.
router.post('/push', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    if (!body?.changes || typeof body.changes !== 'object' || Array.isArray(body.changes)) {
        throw errors_1.err.badRequest('Body must be {changes:{resource:[rows]}}');
    }
    const changes = body.changes;
    for (const [resource, rows] of Object.entries(changes)) {
        if (!Array.isArray(rows))
            throw errors_1.err.badRequest(`Changes for '${resource}' must be an array`);
    }
    const ctx = (0, audit_1.auditContextFromReq)(req);
    const conflicts = [];
    let applied = 0;
    const addRowError = (resource, row, message) => {
        conflicts.push({
            resource,
            id: row.id ?? null,
            clientRev: typeof row.clientRev === 'number' ? row.clientRev : null,
            resolution: 'error',
            message,
        });
    };
    for (const [resource, inputRows] of Object.entries(changes)) {
        const cfg = resources_1.RESOURCE_MAP[resource];
        for (const input of inputRows) {
            if (!input || typeof input !== 'object' || Array.isArray(input)) {
                addRowError(resource, {}, 'Invalid change row');
                continue;
            }
            const row = input;
            if (!cfg || SYNC_EXCLUDE.has(resource) || cfg.readOnly) {
                addRowError(resource, row, 'Resource is not available for sync writes');
                continue;
            }
            const id = row.id;
            const operation = row._op;
            const clientRev = row.clientRev;
            const isDelete = operation === 'delete';
            const permittedRoles = isDelete ? cfg.deleteRoles : cfg.writeRoles;
            if (!permittedRoles.includes(req.user.role) || (isDelete && cfg.appendOnly)) {
                addRowError(resource, row, 'Role is not permitted to apply this change');
                continue;
            }
            if (operation !== undefined && operation !== 'upsert' && operation !== 'delete') {
                addRowError(resource, row, 'Invalid sync operation');
                continue;
            }
            if (clientRev !== undefined && (typeof clientRev !== 'number' || !Number.isFinite(clientRev) || clientRev < 0)) {
                addRowError(resource, row, 'Invalid client revision');
                continue;
            }
            if (id !== undefined && (typeof id !== 'number' || !Number.isInteger(id) || id < 1)) {
                addRowError(resource, row, 'Invalid row id');
                continue;
            }
            if (isDelete && id === undefined) {
                addRowError(resource, row, 'A row id is required for deletion');
                continue;
            }
            const clientUpdatedAt = row.updatedAt === undefined ? null : new Date(String(row.updatedAt));
            if (clientUpdatedAt && !Number.isFinite(clientUpdatedAt.getTime())) {
                addRowError(resource, row, 'Invalid updatedAt timestamp');
                continue;
            }
            const fields = {};
            const allowedFields = new Set(Object.keys(cfg.schema.shape));
            for (const [key, value] of Object.entries(row)) {
                if (allowedFields.has(key))
                    fields[key] = value;
            }
            delete fields.id;
            delete fields.createdAt;
            delete fields.updatedAt;
            delete fields.deletedAt;
            delete fields.rev;
            const delegate = prisma_1.prisma[cfg.model];
            if (isDelete) {
                try {
                    const existing = await delegate.findUnique({ where: { id } });
                    if (existing && !existing.deletedAt) {
                        await delegate.update({
                            where: { id },
                            data: { deletedAt: new Date(), rev: { increment: 1 } },
                        });
                        await (0, audit_1.writeAudit)(ctx, cfg.label, id, 'DELETE', existing, null);
                        applied++;
                    }
                }
                catch (error) {
                    console.error(`[sync] failed to delete ${resource} row`, error);
                    addRowError(resource, row, 'Unable to apply change');
                }
                continue;
            }
            const validation = (id === undefined ? cfg.schema : cfg.schema.partial()).safeParse(fields);
            if (!validation.success) {
                addRowError(resource, row, 'Row does not match the resource schema');
                continue;
            }
            try {
                if (id !== undefined) {
                    const existing = await delegate.findUnique({ where: { id } });
                    if (existing) {
                        if (cfg.appendOnly) {
                            addRowError(resource, row, 'Append-only resources cannot be updated');
                            continue;
                        }
                        if (existing.deletedAt) {
                            addRowError(resource, row, 'Deleted rows cannot be updated');
                            continue;
                        }
                        const staleRevision = typeof clientRev === 'number' && clientRev < existing.rev;
                        const staleTimestamp = clientUpdatedAt !== null && clientUpdatedAt < new Date(existing.updatedAt);
                        if (staleRevision || staleTimestamp) {
                            conflicts.push({
                                resource,
                                id,
                                serverRev: existing.rev,
                                clientRev: clientRev ?? null,
                                resolution: 'last_write_wins',
                            });
                            await (0, audit_1.writeAudit)(ctx, cfg.label, id, 'SYNC_CONFLICT', existing, validation.data);
                            if (!clientUpdatedAt || clientUpdatedAt < new Date(existing.updatedAt))
                                continue;
                        }
                        const updated = await delegate.update({
                            where: { id },
                            data: { ...validation.data, rev: { increment: 1 } },
                        });
                        await (0, audit_1.writeAudit)(ctx, cfg.label, id, 'UPDATE', existing, updated);
                        applied++;
                        continue;
                    }
                }
                const created = await delegate.create({
                    data: { ...validation.data, ...(id !== undefined ? { id } : {}), rev: 0 },
                });
                await (0, audit_1.writeAudit)(ctx, cfg.label, created.id, 'CREATE', null, created);
                applied++;
            }
            catch (error) {
                console.error(`[sync] failed to apply ${resource} row`, error);
                addRowError(resource, row, 'Unable to apply change');
            }
        }
    }
    res.json({ applied, conflicts });
}));
exports.default = router;
