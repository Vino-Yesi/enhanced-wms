import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, ADMIN_ONLY, asyncHandler } from '../middleware/auth';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';

const router = Router();

// GET /api/settings — all authenticated can read global settings
router.get(
  '/',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const rows = await prisma.setting.findMany();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    res.json(out);
  }),
);

// PUT /api/settings — admin only, merge key/values
router.put(
  '/',
  authenticate,
  requireRole(...ADMIN_ONLY),
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw err.badRequest('Body must be a key/value object');
    for (const [key, value] of Object.entries(body)) {
      await prisma.setting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
    }
    const rows = await prisma.setting.findMany();
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    await writeAudit(auditContextFromReq(req), 'settings', undefined, 'UPDATE', null, body);
    res.json(out);
  }),
);

export default router;
