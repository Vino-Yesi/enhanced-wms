import { Response, NextFunction, Request } from 'express';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const err = {
  badRequest: (msg = 'Bad request') => new ApiError(400, 'BAD_REQUEST', msg),
  unauthorized: (msg = 'Unauthorized') => new ApiError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'Forbidden') => new ApiError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Not found') => new ApiError(404, 'NOT_FOUND', msg),
  conflict: (msg = 'Conflict') => new ApiError(409, 'CONFLICT', msg),
  unprocessable: (msg = 'Unprocessable entity') => new ApiError(422, 'VALIDATION_ERROR', msg),
  tooMany: (msg = 'Too many requests') => new ApiError(429, 'RATE_LIMITED', msg),
  internal: (msg = 'Internal server error') => new ApiError(500, 'INTERNAL', msg),
};

// Global error handler — never leaks stack traces.
export function errorHandler(
  e: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (e instanceof ApiError) {
    return res.status(e.status).json({ error: { code: e.code, message: e.message } });
  }
  // Zod validation errors
  if ((e as any)?.issues && Array.isArray((e as any).issues)) {
    const issues = (e as any).issues as Array<{ path: (string | number)[]; message: string }>;
    const msg = issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: msg } });
  }
  // Prisma known errors
  const code = (e as any)?.code;
  if (code === 'P2002') return res.status(409).json({ error: { code: 'CONFLICT', message: 'Unique constraint violation' } });
  if (code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
  console.error('[error]', e);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal server error' } });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
