import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessPayload } from '../lib/jwt';
import { err, asyncHandler } from '../lib/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(err.unauthorized('Missing or malformed Authorization header'));
  }
  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch {
    return next(err.unauthorized('Invalid or expired access token'));
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(err.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(err.forbidden(`Role '${req.user.role}' is not permitted for this action`));
    }
    next();
  };
}

export const ALL_ROLES = ['admin', 'supervisor', 'operator', 'auditor'];
export const WRITE_ROLES = ['admin', 'supervisor', 'operator'];
export const SUPERVISOR_UP = ['admin', 'supervisor'];
export const ADMIN_ONLY = ['admin'];
export const AUDIT_READ = ['admin', 'auditor'];

export { asyncHandler };
