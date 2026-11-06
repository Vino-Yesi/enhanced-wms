import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, ADMIN_ONLY, asyncHandler } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  level: z.enum(['info', 'warning', 'critical']).default('info'),
});

// GET /api/notifications — all authenticated
router.get(
  '/',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await prisma.notification.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(rows.map((r) => ({ ...r, acknowledgedBy: JSON.parse(r.acknowledgedBy || '[]') })));
  }),
);

// POST /api/notifications — admin creates announcement
router.post(
  '/',
  authenticate,
  requireRole(...ADMIN_ONLY),
  validateBody(createSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { title, body, level } = req.body;
    const created = await prisma.notification.create({
      data: { title, body, level, createdBy: req.user!.sub, acknowledgedBy: '[]', rev: 0 },
    });
    await writeAudit(auditContextFromReq(req), 'notifications', created.id, 'CREATE', null, { title, level });
    res.status(201).json({ ...created, acknowledgedBy: [] });
  }),
);

// POST /api/notifications/:id/ack — any authenticated user acknowledges
router.post(
  '/:id/ack',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw err.badRequest('Invalid id');
    const existing = await prisma.notification.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw err.notFound('Notification not found');
    const acked: number[] = JSON.parse(existing.acknowledgedBy || '[]');
    const uid = req.user!.sub;
    if (!acked.includes(uid)) acked.push(uid);
    const updated = await prisma.notification.update({
      where: { id },
      data: { acknowledgedBy: JSON.stringify(acked), rev: { increment: 1 } },
    });
    await writeAudit(auditContextFromReq(req), 'notifications', id, 'UPDATE', null, { acknowledgedBy: acked });
    res.json({ ...updated, acknowledgedBy: acked });
  }),
);

export default router;
