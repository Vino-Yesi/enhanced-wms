import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/auth';

const router = Router();

// GET /api/health — no auth
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    let dbStatus = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }
    res.json({ status: dbStatus === 'ok' ? 'ok' : 'degraded', uptime: process.uptime(), db: dbStatus });
  }),
);

export default router;
