"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const exceljs_1 = __importDefault(require("exceljs"));
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const errors_1 = require("../lib/errors");
const resources_1 = require("./resources");
const router = (0, express_1.Router)();
function toCsv(rows) {
    if (!rows.length)
        return '';
    const headers = Object.keys(rows[0]);
    const escape = (v) => {
        if (v == null)
            return '';
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows)
        lines.push(headers.map((h) => escape(r[h])).join(','));
    return lines.join('\n');
}
// GET /api/export/:resource?format=csv|xlsx
router.get('/:resource', auth_1.authenticate, (0, auth_1.requireRole)(...auth_1.SUPERVISOR_UP), (0, auth_1.asyncHandler)(async (req, res) => {
    const resource = req.params.resource;
    const cfg = resources_1.RESOURCE_MAP[resource];
    if (!cfg)
        throw errors_1.err.notFound(`Unknown resource '${resource}'`);
    const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
    const rows = await prisma_1.prisma[cfg.model].findMany({ where: { deletedAt: null }, take: 10000 });
    const clean = rows.map((r) => {
        const out = { ...r };
        for (const f of cfg.sensitiveFields ?? [])
            delete out[f];
        return out;
    });
    const filename = `${resource}-${new Date().toISOString().slice(0, 10)}.${format}`;
    if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('\uFEFF' + toCsv(clean));
    }
    else {
        const wb = new exceljs_1.default.Workbook();
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
}));
exports.default = router;
