import { Router, Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, SUPERVISOR_UP, asyncHandler } from '../middleware/auth';
import { err } from '../lib/errors';
import { RESOURCE_MAP } from './resources';

const router = Router();

function toCsv(rows: any[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(','));
  return lines.join('\n');
}

// GET /api/export/:resource?format=csv|xlsx
router.get(
  '/:resource',
  authenticate,
  requireRole(...SUPERVISOR_UP),
  asyncHandler(async (req: Request, res: Response) => {
    const resource = req.params.resource;
    const cfg = RESOURCE_MAP[resource];
    if (!cfg) throw err.notFound(`Unknown resource '${resource}'`);
    const format = (req.query.format as string) === 'xlsx' ? 'xlsx' : 'csv';
    const rows = await (prisma as any)[cfg.model].findMany({ where: { deletedAt: null }, take: 10000 });
    const clean = rows.map((r: any) => {
      const out = { ...r };
      for (const f of cfg.sensitiveFields ?? []) delete out[f];
      return out;
    });

    const filename = `${resource}-${new Date().toISOString().slice(0, 10)}.${format}`;
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + toCsv(clean));
    } else {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(resource.slice(0, 30));
      if (clean.length) {
        ws.columns = Object.keys(clean[0]).map((k) => ({ header: k, key: k, width: 18 }));
        ws.addRows(clean);
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    }
  }),
);

export default router;
