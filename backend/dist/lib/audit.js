"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditContextFromReq = auditContextFromReq;
exports.writeAudit = writeAudit;
const prisma_1 = require("./prisma");
function auditContextFromReq(req) {
    const user = req.user;
    return {
        operatorId: user?.sub,
        operatorName: user?.username,
        ip: req.ip || (req.socket?.remoteAddress ?? undefined),
        userAgent: req.headers['user-agent'],
    };
}
async function writeAudit(ctx, entity, entityId, action, oldValues, newValues) {
    try {
        await prisma_1.prisma.auditLog.create({
            data: {
                entity,
                entityId: entityId != null ? String(entityId) : null,
                action,
                operatorId: ctx.operatorId ?? null,
                operatorName: ctx.operatorName ?? null,
                oldValues: oldValues != null ? JSON.stringify(oldValues) : null,
                newValues: newValues != null ? JSON.stringify(newValues) : null,
                ip: ctx.ip ?? null,
                userAgent: ctx.userAgent ?? null,
            },
        });
    }
    catch (e) {
        // Audit logging must never break the primary request.
        console.error('[audit] failed to write audit log:', e.message);
    }
}
