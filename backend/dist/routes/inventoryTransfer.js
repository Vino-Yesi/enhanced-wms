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
const transferSchema = zod_1.z.object({
    sku: zod_1.z.string().min(1),
    quantity: zod_1.z.coerce.number().int().positive(),
    fromLocation: zod_1.z.string().min(1),
    toLocation: zod_1.z.string().min(1),
    note: zod_1.z.string().optional(),
});
// POST /api/inventory/transfer — atomic stock move + movement record
router.post('/transfer', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.SUPERVISOR_UP), (0, validate_1.validateBody)(transferSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const { sku, quantity, fromLocation, toLocation, note } = req.body;
    if (fromLocation === toLocation)
        throw errors_1.err.badRequest('fromLocation and toLocation must differ');
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const source = await tx.inventoryItem.findFirst({
            where: { sku, location: fromLocation, deletedAt: null },
        });
        if (!source)
            throw errors_1.err.notFound(`SKU ${sku} not found at location ${fromLocation}`);
        if (source.stock < quantity)
            throw errors_1.err.conflict(`Insufficient stock: ${source.stock} available, ${quantity} requested`);
        const dest = await tx.inventoryItem.findFirst({
            where: { sku, location: toLocation, deletedAt: null },
        });
        const updatedSource = await tx.inventoryItem.update({
            where: { id: source.id },
            data: { stock: { decrement: quantity }, rev: { increment: 1 } },
        });
        let updatedDest;
        if (dest) {
            updatedDest = await tx.inventoryItem.update({
                where: { id: dest.id },
                data: { stock: { increment: quantity }, rev: { increment: 1 } },
            });
        }
        else {
            updatedDest = await tx.inventoryItem.create({
                data: {
                    sku, product: source.product, stock: quantity, location: toLocation,
                    category: source.category, velocity: source.velocity, weight: source.weight,
                    reorderPoint: source.reorderPoint, reorderQty: source.reorderQty,
                    costPerUnit: source.costPerUnit, rev: 0,
                },
            });
        }
        const movement = await tx.inventoryMovement.create({
            data: {
                sku, type: 'transfer', quantity, fromLocation, toLocation,
                operator: req.user.username, lotNumber: source.lotNumber, note: note ?? null,
                timestamp: new Date().toISOString(), rev: 0,
            },
        });
        return { source: updatedSource, dest: updatedDest, movement };
    });
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'inventory', result.source.id, 'UPDATE', null, { transfer: { sku, quantity, fromLocation, toLocation } });
    res.json({ ok: true, ...result });
}));
exports.default = router;
