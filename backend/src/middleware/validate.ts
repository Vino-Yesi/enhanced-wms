import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/** Validate req.body against a zod schema; strips unknown keys. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req.body ?? {});
    req.body = parsed;
    next();
  };
}

/** Basic input sanitization: trim strings, drop __proto__ / constructor pollution. */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      clean[k] = typeof v === 'string' ? v.trim() : v;
    }
    req.body = clean;
  }
  next();
}
