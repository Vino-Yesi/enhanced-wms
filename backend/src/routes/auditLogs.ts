import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, AUDIT_READ, asyncHandler } from '../middleware/auth';
import { err } from '../lib/errors';

const router = Router();

// GET /api/audit-logs — admin + auditor. Filters: ?entity=, ?action=, ?operator=, ?from=, ?to=
router.get(
  '/',
  authenticate,
  requireRole(...AUDIT_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 50));
    const sortDir = (req.query.sortDir as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const where: any = {};
    if (req.query.entity) where.entity = req.query.entity;
    if (req.query.action) where.action = req.query.action;
    if (req.query.operator) where.operatorName = { contains: req.query.operator as string };
    const createdAt: any = {};
    if (req.query.from) createdAt.gte = new Date(req.query.from as string);
    if (req.query.to) createdAt.lte = new Date(req.query.to as string);
    if (Object.keys(createdAt).length) where.createdAt = createdAt;

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: sortDir }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ data: rows, total, page, pageSize });
  }),
);

// GET /api/audit-logs/:id
router.get(
  '/:id',
  authenticate,
  requireRole(...AUDIT_READ),
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw err.badRequest('Invalid id');
    const row = await prisma.auditLog.findUnique({ where: { id } });
    if (!row) throw err.notFound('Audit log entry not found');
    res.json(row);
  }),
);

export default router;
