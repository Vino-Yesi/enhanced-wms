import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, SUPERVISOR_UP, asyncHandler } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';

const router = Router();

const transferSchema = z.object({
  sku: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  fromLocation: z.string().min(1),
  toLocation: z.string().min(1),
  note: z.string().optional(),
});

// POST /api/inventory/transfer — atomic stock move + movement record
router.post(
  '/transfer',
  authenticate,
  requireRole(...SUPERVISOR_UP),
  validateBody(transferSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sku, quantity, fromLocation, toLocation, note } = req.body;
    if (fromLocation === toLocation) throw err.badRequest('fromLocation and toLocation must differ');

    const result = await prisma.$transaction(async (tx: any) => {
      const source = await tx.inventoryItem.findFirst({
        where: { sku, location: fromLocation, deletedAt: null },
      });
      if (!source) throw err.notFound(`SKU ${sku} not found at location ${fromLocation}`);
      if (source.stock < quantity) throw err.conflict(`Insufficient stock: ${source.stock} available, ${quantity} requested`);

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
      } else {
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
          operator: req.user!.username, lotNumber: source.lotNumber, note: note ?? null,
          timestamp: new Date().toISOString(), rev: 0,
        },
      });

      return { source: updatedSource, dest: updatedDest, movement };
    });

    await writeAudit(auditContextFromReq(req), 'inventory', result.source.id, 'UPDATE', null, { transfer: { sku, quantity, fromLocation, toLocation } });
    res.json({ ok: true, ...result });
  }),
);

export default router;
