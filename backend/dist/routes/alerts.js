"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/alerts/low-stock
router.get('/low-stock', auth_1.authenticate, (0, auth_1.asyncHandler)(async (_req, res) => {
    const items = await prisma_1.prisma.inventoryItem.findMany({
        where: { deletedAt: null, reorderPoint: { not: null } },
        orderBy: { stock: 'asc' },
    });
    res.json(items.filter((i) => i.stock <= (i.reorderPoint ?? 0)));
}));
exports.default = router;
