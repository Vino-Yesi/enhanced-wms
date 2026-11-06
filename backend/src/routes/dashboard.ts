import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, asyncHandler } from '../middleware/auth';

const router = Router();

const OPEN_STATUSES = ['Pending', 'Picking', 'Packed', 'ReadyToShip', 'QCHold', 'CrossDock'];

// GET /api/dashboard/kpis
router.get(
  '/kpis',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

    const [totalSkus, unitsAgg, ordersOpen, ordersShippedToday, inboundPending, lowStock, cycleCountPending, perfAgg] = await Promise.all([
      prisma.inventoryItem.count({ where: { deletedAt: null } }),
      prisma.inventoryItem.aggregate({ where: { deletedAt: null }, _sum: { stock: true } }),
      prisma.order.count({ where: { deletedAt: null, status: { in: OPEN_STATUSES } } }),
      prisma.order.count({ where: { deletedAt: null, status: 'Shipped', updatedAt: { gte: startOfDay } } }),
      prisma.inboundRecord.count({ where: { deletedAt: null, qcStatus: 'pending' } }),
      prisma.inventoryItem.findMany({ where: { deletedAt: null, reorderPoint: { not: null } }, select: { stock: true, reorderPoint: true } }),
      prisma.cycleCount.count({ where: { deletedAt: null, status: 'pending' } }),
      prisma.workerPerformance.aggregate({
        where: { deletedAt: null },
        _avg: { accuracy: true, uph: true },
      }),
    ]);

    const lowStockCount = lowStock.filter((i) => i.stock <= (i.reorderPoint ?? 0)).length;
    const totalOrders = await prisma.order.count({ where: { deletedAt: null, status: { in: ['Shipped', 'Cancelled', 'Returned'] } } });
    const shippedCount = await prisma.order.count({ where: { deletedAt: null, status: 'Shipped' } });
    const onTimeShipRate = totalOrders > 0 ? Math.round((shippedCount / totalOrders) * 1000) / 10 : 100;

    res.json({
      totalSkus,
      totalUnits: unitsAgg._sum.stock ?? 0,
      ordersOpen,
      ordersShippedToday,
      inboundPending,
      lowStockCount,
      cycleCountPending,
      pickingAccuracy: Math.round((perfAgg._avg.accuracy ?? 100) * 10) / 10,
      uphAvg: Math.round((perfAgg._avg.uph ?? 0) * 10) / 10,
      onTimeShipRate,
    });
  }),
);

// GET /api/dashboard/charts?range=7d|30d|90d
router.get(
  '/charts',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const range = (req.query.range as string) || '30d';
    const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 86400000);

    const [orders, inbound, topSkus, zones, lowStock] = await Promise.all([
      prisma.order.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      prisma.inboundRecord.findMany({ where: { deletedAt: null }, select: { receivedAt: true } }),
      prisma.inventoryItem.findMany({ where: { deletedAt: null }, orderBy: { stock: 'desc' }, take: 10, select: { sku: true, product: true, stock: true } }),
      prisma.zoneCapacity.findMany({ where: { deletedAt: null }, select: { zone: true, currentUtilization: true } }),
      prisma.inventoryItem.findMany({ where: { deletedAt: null, reorderPoint: { not: null } }, select: { sku: true, product: true, stock: true, reorderPoint: true }, take: 20 }),
    ]);

    const dayBuckets = new Map<string, { count: number; shipped: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      dayBuckets.set(d.toISOString().slice(0, 10), { count: 0, shipped: 0 });
    }
    for (const o of orders) {
      const key = new Date(o.createdAt).toISOString().slice(0, 10);
      if (dayBuckets.has(key)) {
        const b = dayBuckets.get(key)!;
        b.count++;
        if (o.status === 'Shipped') b.shipped++;
      }
    }
    const ordersByDay = [...dayBuckets.entries()].map(([date, v]) => ({ date, count: v.count, shipped: v.shipped }));

    const inBuckets = new Map<string, number>();
    for (const r of inbound) {
      const key = (r.receivedAt || '').slice(0, 10);
      if (!key) continue;
      inBuckets.set(key, (inBuckets.get(key) ?? 0) + 1);
    }
    const inboundByDay = [...inBuckets.entries()].sort().map(([date, count]) => ({ date, count }));

    const velocityRows = await prisma.inventoryItem.groupBy({ by: ['velocity'], where: { deletedAt: null }, _count: { _all: true } });
    const velocityDistribution: Record<string, number> = { high: 0, medium: 0, low: 0 };
    for (const v of velocityRows) velocityDistribution[(v.velocity as string) || 'medium'] = v._count._all;

    res.json({
      ordersByDay,
      inboundByDay,
      topSkus: topSkus.map((t) => ({ sku: t.sku, product: t.product, units: t.stock })),
      velocityDistribution,
      zoneUtilization: zones.map((z) => ({ zone: z.zone, utilization: z.currentUtilization })),
      lowStock: lowStock.filter((i) => i.stock <= (i.reorderPoint ?? 0)).map((i) => ({ sku: i.sku, product: i.product, stock: i.stock, reorderPoint: i.reorderPoint })),
    });
  }),
);

export default router;
