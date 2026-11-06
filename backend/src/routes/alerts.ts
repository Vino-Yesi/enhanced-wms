import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, asyncHandler } from '../middleware/auth';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';

const router = Router();

// GET /api/alerts/low-stock
router.get(
  '/low-stock',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const items = await prisma.inventoryItem.findMany({
      where: { deletedAt: null, reorderPoint: { not: null } },
      orderBy: { stock: 'asc' },
    });
    res.json(items.filter((i) => i.stock <= (i.reorderPoint ?? 0)));
  }),
);

export default router;
