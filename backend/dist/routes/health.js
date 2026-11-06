"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/health — no auth
router.get('/', (0, auth_1.asyncHandler)(async (_req, res) => {
    let dbStatus = 'ok';
    try {
        await prisma_1.prisma.$queryRaw `SELECT 1`;
    }
    catch {
        dbStatus = 'error';
    }
    res.json({ status: dbStatus === 'ok' ? 'ok' : 'degraded', uptime: process.uptime(), db: dbStatus });
}));
exports.default = router;
