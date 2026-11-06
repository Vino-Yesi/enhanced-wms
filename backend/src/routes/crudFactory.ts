import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, asyncHandler } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';
import { ResourceConfig } from './resources';

const RESERVED = new Set(['q', 'page', 'pageSize', 'sortBy', 'sortDir', 'includeDeleted']);

function stripSensitive(row: any, cfg: ResourceConfig): any {
  if (!row) return row;
  const out = { ...row };
  for (const f of cfg.sensitiveFields ?? []) delete out[f];
  return out;
}

export function buildCrudRouter(cfg: ResourceConfig): Router {
  const router = Router();
  const delegate = () => (prisma as any)[cfg.model];

  // ── LIST ───────────────────────────────────────────────────────────
  router.get(
    '/',
    authenticate,
    requireRole(...cfg.readRoles),
    asyncHandler(async (req: Request, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize as string) || 50));
      const q = (req.query.q as string)?.trim();
      const sortBy = (req.query.sortBy as string) || 'updatedAt';
      const sortDir = (req.query.sortDir as string)?.toLowerCase() === 'asc' ? 'asc' : 'desc';
      const includeDeleted = req.query.includeDeleted === '1';

      const where: any = {};
      if (!includeDeleted) where.deletedAt = null;
      if (q && cfg.searchFields.length) {
        where.OR = cfg.searchFields.map((f) => ({ [f]: { contains: q } }));
      }
      // Entity-specific filters: any other query param = equality filter
      for (const [key, val] of Object.entries(req.query)) {
        if (RESERVED.has(key)) continue;
        if (typeof val === 'string' && val !== '') where[key] = val;
      }

      const [total, rows] = await Promise.all([
        delegate().count({ where }),
        delegate().findMany({
          where,
          orderBy: { [sortBy]: sortDir },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const data = rows.map((r: any) => {
        const out = stripSensitive(r, cfg);
        if (cfg.listOmit) for (const f of cfg.listOmit) {
          if (out[f] && typeof out[f] === 'string' && out[f].length > 64) out[f] = out[f].slice(0, 64) + '…[truncated]';
        }
        return out;
      });
      res.json({ data, total, page, pageSize });
    }),
  );

  // ── GET single ─────────────────────────────────────────────────────
  router.get(
    '/:id',
    authenticate,
    requireRole(...cfg.readRoles),
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) throw err.badRequest('Invalid id');
      const row = await delegate().findUnique({ where: { id } });
      if (!row || (row.deletedAt && req.query.includeDeleted !== '1')) throw err.notFound(`${cfg.path} not found`);
      res.json(stripSensitive(row, cfg));
    }),
  );

  if (cfg.readOnly) return router;

  // ── CREATE ─────────────────────────────────────────────────────────
  router.post(
    '/',
    authenticate,
    requireRole(...cfg.writeRoles),
    validateBody(cfg.schema),
    asyncHandler(async (req: Request, res: Response) => {
      let data = { ...req.body };
      delete data.id; delete data.createdAt; delete data.updatedAt; delete data.deletedAt; delete data.rev;
      if (cfg.adminOnly && data.password) {
        const { hashPassword } = require('../lib/password');
        data.password = await hashPassword(data.password);
      }
      const created = await delegate().create({ data: { ...data, rev: 0 } });
      await writeAudit(auditContextFromReq(req), cfg.label, created.id, 'CREATE', null, stripSensitive(created, cfg));
      res.status(201).json(stripSensitive(created, cfg));
    }),
  );

  if (cfg.appendOnly) return router;

  // ── UPDATE ─────────────────────────────────────────────────────────
  router.put(
    '/:id',
    authenticate,
    requireRole(...cfg.writeRoles),
    validateBody(cfg.schema.partial()),
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) throw err.badRequest('Invalid id');
      const existing = await delegate().findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw err.notFound(`${cfg.path} not found`);
      let data = { ...req.body };
      delete data.id; delete data.createdAt; delete data.updatedAt; delete data.deletedAt; delete data.rev;
      if (cfg.adminOnly && data.password) {
        const { hashPassword } = require('../lib/password');
        data.password = await hashPassword(data.password);
      }
      const updated = await delegate().update({
        where: { id },
        data: { ...data, rev: { increment: 1 } },
      });
      await writeAudit(
        auditContextFromReq(req),
        cfg.label,
        id,
        'UPDATE',
        stripSensitive(existing, cfg),
        stripSensitive(updated, cfg),
      );
      res.json(stripSensitive(updated, cfg));
    }),
  );

  // ── DELETE (soft / tombstone) ──────────────────────────────────────
  router.delete(
    '/:id',
    authenticate,
    requireRole(...cfg.deleteRoles),
    asyncHandler(async (req: Request, res: Response) => {
      const id = parseInt(req.params.id);
      if (isNaN(id)) throw err.badRequest('Invalid id');
      const existing = await delegate().findUnique({ where: { id } });
      if (!existing || existing.deletedAt) throw err.notFound(`${cfg.path} not found`);
      const updated = await delegate().update({
        where: { id },
        data: { deletedAt: new Date(), rev: { increment: 1 } },
      });
      await writeAudit(auditContextFromReq(req), cfg.label, id, 'DELETE', stripSensitive(existing, cfg), null);
      res.json(stripSensitive(updated, cfg));
    }),
  );

  return router;
}
