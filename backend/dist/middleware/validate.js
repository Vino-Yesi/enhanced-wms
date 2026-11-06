"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = validateBody;
exports.sanitizeInput = sanitizeInput;
/** Validate req.body against a zod schema; strips unknown keys. */
function validateBody(schema) {
    return (req, _res, next) => {
        const parsed = schema.parse(req.body ?? {});
        req.body = parsed;
        next();
    };
}
/** Basic input sanitization: trim strings, drop __proto__ / constructor pollution. */
function sanitizeInput(req, _res, next) {
    if (req.body && typeof req.body === 'object') {
        const clean = {};
        for (const [k, v] of Object.entries(req.body)) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype')
                continue;
            clean[k] = typeof v === 'string' ? v.trim() : v;
        }
        req.body = clean;
    }
    next();
}
