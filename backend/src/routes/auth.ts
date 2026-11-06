import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  signAccessToken, signRefreshToken, verifyRefreshToken, hashRefreshToken, REFRESH_TTL_MS,
} from '../lib/jwt';
import { authenticate, asyncHandler } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { err } from '../lib/errors';
import { writeAudit, auditContextFromReq } from '../lib/audit';

const router = Router();

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
const profileSchema = z.object({ displayName: z.string().trim().min(1).max(100) });

function publicUser(u: any) {
  return { id: u.id, username: u.username, role: u.role, displayName: u.displayName, createdAt: u.createdAt };
}

async function issueTokens(user: any) {
  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role, displayName: user.displayName });
  const { token: refreshToken } = signRefreshToken(user.id);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return { accessToken, refreshToken };
}

// POST /api/auth/login
router.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || user.deletedAt) throw err.unauthorized('Invalid username or password');
    const ok = await verifyPassword(user.password, password);
    if (!ok) throw err.unauthorized('Invalid username or password');
    const tokens = await issueTokens(user);
    const ctx = auditContextFromReq(req);
    ctx.operatorId = user.id;
    ctx.operatorName = user.username;
    await writeAudit(ctx, 'auth', user.id, 'LOGIN', null, { username: user.username });
    res.json({ ...tokens, user: publicUser(user) });
  }),
);

// POST /api/auth/refresh — rotating refresh tokens
router.post(
  '/refresh',
  validateBody(refreshSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    let payload: { sub: number; jti: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw err.unauthorized('Invalid refresh token');
    }
    const tokenHash = hashRefreshToken(refreshToken);
    const stored = await prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!stored) {
      // Token reuse or revoked — revoke all active tokens for this user as a safety measure
      await prisma.refreshToken.updateMany({ where: { userId: payload.sub, revokedAt: null }, data: { revokedAt: new Date() } });
      throw err.unauthorized('Refresh token revoked or expired');
    }
    // Rotate: revoke old, issue new pair
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt) throw err.unauthorized('User not found');
    const tokens = await issueTokens(user);
    res.json(tokens);
  }),
);

// POST /api/auth/logout
router.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const bodyToken = (req.body as any)?.refreshToken as string | undefined;
    if (bodyToken) {
      try {
        const hash = hashRefreshToken(bodyToken);
        await prisma.refreshToken.updateMany({ where: { tokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() } });
      } catch { /* ignore */ }
    } else {
      await prisma.refreshToken.updateMany({ where: { userId: req.user!.sub, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeAudit(auditContextFromReq(req), 'auth', req.user!.sub, 'LOGOUT', null, null);
    res.json({ ok: true });
  }),
);

// GET /api/auth/me
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.deletedAt) throw err.unauthorized('User not found');
    res.json(publicUser(user));
  }),
);

// PUT /api/auth/profile — users may update only their own display name
router.put(
  '/profile',
  authenticate,
  validateBody(profileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.deletedAt) throw err.unauthorized('User not found');
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { displayName: req.body.displayName, rev: { increment: 1 } },
    });
    await writeAudit(
      auditContextFromReq(req),
      'users',
      user.id,
      'UPDATE',
      { displayName: user.displayName },
      { displayName: updated.displayName },
    );
    res.json(publicUser(updated));
  }),
);

// POST /api/auth/change-password
router.post(
  '/change-password',
  authenticate,
  validateBody(changePasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) throw err.unauthorized('User not found');
    const ok = await verifyPassword(user.password, currentPassword);
    if (!ok) throw err.forbidden('Current password is incorrect');
    const hashed = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed, rev: { increment: 1 } } });
    // Invalidate all refresh tokens on password change
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await writeAudit(auditContextFromReq(req), 'auth', user.id, 'PASSWORD_CHANGE', null, null);
    res.json({ ok: true });
  }),
);

export default router;
