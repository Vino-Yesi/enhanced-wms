import { Request } from 'express';
import { prisma } from './prisma';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SYNC_CONFLICT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE';

export interface AuditContext {
  operatorId?: number;
  operatorName?: string;
  ip?: string;
  userAgent?: string;
}

export function auditContextFromReq(req: Request): AuditContext {
  const user = (req as any).user;
  return {
    operatorId: user?.sub,
    operatorName: user?.username,
    ip: req.ip || (req.socket?.remoteAddress ?? undefined),
    userAgent: req.headers['user-agent'],
  };
}

export async function writeAudit(
  ctx: AuditContext,
  entity: string,
  entityId: string | number | undefined,
  action: AuditAction,
  oldValues: unknown,
  newValues: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: {
        entity,
        entityId: entityId != null ? String(entityId) : null,
        action,
        operatorId: ctx.operatorId ?? null,
        operatorName: ctx.operatorName ?? null,
        oldValues: oldValues != null ? JSON.stringify(oldValues) : null,
        newValues: newValues != null ? JSON.stringify(newValues) : null,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  } catch (e) {
    // Audit logging must never break the primary request.
    console.error('[audit] failed to write audit log:', (e as Error).message);
  }
}
