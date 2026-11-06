"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /api/labor/aggregation?from=&to=
router.get('/aggregation', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const [perf, tasks] = await Promise.all([
        prisma_1.prisma.workerPerformance.findMany({
            where: { deletedAt: null, date: { gte: from.toISOString().slice(0, 10), lte: to.toISOString().slice(0, 10) } },
        }),
        prisma_1.prisma.workerTask.findMany({
            where: { deletedAt: null, createdAt: { gte: from, lte: to } },
            select: { type: true, actualTime: true },
        }),
    ]);
    const byWorkerMap = new Map();
    for (const p of perf) {
        const key = p.workerId;
        if (!byWorkerMap.has(key)) {
            byWorkerMap.set(key, { workerId: p.workerId, workerName: p.workerName, tasksCompleted: 0, uphSum: 0, accSum: 0, errors: 0, n: 0 });
        }
        const w = byWorkerMap.get(key);
        w.tasksCompleted += p.tasksCompleted;
        w.uphSum += p.uph;
        w.accSum += p.accuracy;
        w.errors += p.errors;
        w.n++;
    }
    const byWorker = [...byWorkerMap.values()].map((w) => ({
        workerId: w.workerId,
        workerName: w.workerName,
        tasksCompleted: w.tasksCompleted,
        uph: w.n ? Math.round((w.uphSum / w.n) * 10) / 10 : 0,
        accuracy: w.n ? Math.round((w.accSum / w.n) * 10) / 10 : 0,
        errors: w.errors,
    }));
    const byTypeMap = new Map();
    for (const t of tasks) {
        if (!byTypeMap.has(t.type))
            byTypeMap.set(t.type, { count: 0, timeSum: 0 });
        const b = byTypeMap.get(t.type);
        b.count++;
        if (typeof t.actualTime === 'number')
            b.timeSum += t.actualTime;
    }
    const byTaskType = [...byTypeMap.entries()].map(([type, v]) => ({
        type,
        count: v.count,
        avgTime: v.count ? Math.round((v.timeSum / v.count) * 10) / 10 : 0,
    }));
    res.json({ byWorker, byTaskType });
}));
exports.default = router;
