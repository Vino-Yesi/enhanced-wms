import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../middleware/auth';
import { err } from '../lib/errors';
import { writeAudit } from '../lib/audit';

const router = Router();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change-me-webhook-secret';

// POST /api/integrations/webhook/:provider — HMAC-SHA256 signature validation
router.post(
  '/webhook/:provider',
  asyncHandler(async (req: Request, res: Response) => {
    const provider = req.params.provider;
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const rawBody: string = (req as any).rawBody ?? JSON.stringify(req.body ?? {});

    const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
    const sigBuf = Buffer.from(signature ?? '');
    const expBuf = Buffer.from(expected);
    const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!signature || !valid) {
      throw err.forbidden('Invalid webhook signature');
    }

    // Update matching integration endpoint lastSync + recordsSynced
    const ep = await prisma.integrationEndpoint.findFirst({ where: { provider, deletedAt: null } });
    if (ep) {
      await prisma.integrationEndpoint.update({
        where: { id: ep.id },
        data: { lastSync: new Date().toISOString(), recordsSynced: { increment: 1 }, status: 'active', rev: { increment: 1 } },
      });
    }
    await writeAudit(
      { operatorName: `webhook:${provider}`, ip: req.ip },
      'integration-endpoints',
      ep?.id ?? provider,
      'UPDATE',
      null,
      { webhookReceived: true, provider },
    );
    res.status(200).json({ received: true, provider });
  }),
);

export default router;
