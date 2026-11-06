"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const password_1 = require("../lib/password");
const jwt_1 = require("../lib/jwt");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const errors_1 = require("../lib/errors");
const audit_1 = require("../lib/audit");
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({ username: zod_1.z.string().min(1), password: zod_1.z.string().min(1) });
const refreshSchema = zod_1.z.object({ refreshToken: zod_1.z.string().min(1) });
const changePasswordSchema = zod_1.z.object({ currentPassword: zod_1.z.string().min(1), newPassword: zod_1.z.string().min(8) });
const profileSchema = zod_1.z.object({ displayName: zod_1.z.string().trim().min(1).max(100) });
function publicUser(u) {
    return { id: u.id, username: u.username, role: u.role, displayName: u.displayName, createdAt: u.createdAt };
}
async function issueTokens(user) {
    const accessToken = (0, jwt_1.signAccessToken)({ sub: user.id, username: user.username, role: user.role, displayName: user.displayName });
    const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id);
    await prisma_1.prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: (0, jwt_1.hashRefreshToken)(refreshToken),
            expiresAt: new Date(Date.now() + jwt_1.REFRESH_TTL_MS),
        },
    });
    return { accessToken, refreshToken };
}
// POST /api/auth/login
router.post('/login', (0, validate_1.validateBody)(loginSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const { username, password } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { username } });
    if (!user || user.deletedAt)
        throw errors_1.err.unauthorized('Invalid username or password');
    const ok = await (0, password_1.verifyPassword)(user.password, password);
    if (!ok)
        throw errors_1.err.unauthorized('Invalid username or password');
    const tokens = await issueTokens(user);
    const ctx = (0, audit_1.auditContextFromReq)(req);
    ctx.operatorId = user.id;
    ctx.operatorName = user.username;
    await (0, audit_1.writeAudit)(ctx, 'auth', user.id, 'LOGIN', null, { username: user.username });
    res.json({ ...tokens, user: publicUser(user) });
}));
// POST /api/auth/refresh — rotating refresh tokens
router.post('/refresh', (0, validate_1.validateBody)(refreshSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const { refreshToken } = req.body;
    let payload;
    try {
        payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
    }
    catch {
        throw errors_1.err.unauthorized('Invalid refresh token');
    }
    const tokenHash = (0, jwt_1.hashRefreshToken)(refreshToken);
    const stored = await prisma_1.prisma.refreshToken.findFirst({
        where: { tokenHash, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!stored) {
        // Token reuse or revoked — revoke all active tokens for this user as a safety measure
        await prisma_1.prisma.refreshToken.updateMany({ where: { userId: payload.sub, revokedAt: null }, data: { revokedAt: new Date() } });
        throw errors_1.err.unauthorized('Refresh token revoked or expired');
    }
    // Rotate: revoke old, issue new pair
    await prisma_1.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const user = await prisma_1.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.deletedAt)
        throw errors_1.err.unauthorized('User not found');
    const tokens = await issueTokens(user);
    res.json(tokens);
}));
// POST /api/auth/logout
router.post('/logout', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const bodyToken = req.body?.refreshToken;
    if (bodyToken) {
        try {
            const hash = (0, jwt_1.hashRefreshToken)(bodyToken);
            await prisma_1.prisma.refreshToken.updateMany({ where: { tokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() } });
        }
        catch { /* ignore */ }
    }
    else {
        await prisma_1.prisma.refreshToken.updateMany({ where: { userId: req.user.sub, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'auth', req.user.sub, 'LOGOUT', null, null);
    res.json({ ok: true });
}));
// GET /api/auth/me
router.get('/me', auth_1.authenticate, (0, auth_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || user.deletedAt)
        throw errors_1.err.unauthorized('User not found');
    res.json(publicUser(user));
}));
// PUT /api/auth/profile — users may update only their own display name
router.put('/profile', auth_1.authenticate, (0, validate_1.validateBody)(profileSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || user.deletedAt)
        throw errors_1.err.unauthorized('User not found');
    const updated = await prisma_1.prisma.user.update({
        where: { id: user.id },
        data: { displayName: req.body.displayName, rev: { increment: 1 } },
    });
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'users', user.id, 'UPDATE', { displayName: user.displayName }, { displayName: updated.displayName });
    res.json(publicUser(updated));
}));
// POST /api/auth/change-password
router.post('/change-password', auth_1.authenticate, (0, validate_1.validateBody)(changePasswordSchema), (0, auth_1.asyncHandler)(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user)
        throw errors_1.err.unauthorized('User not found');
    const ok = await (0, password_1.verifyPassword)(user.password, currentPassword);
    if (!ok)
        throw errors_1.err.forbidden('Current password is incorrect');
    const hashed = await (0, password_1.hashPassword)(newPassword);
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { password: hashed, rev: { increment: 1 } } });
    // Invalidate all refresh tokens on password change
    await prisma_1.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await (0, audit_1.writeAudit)((0, audit_1.auditContextFromReq)(req), 'auth', user.id, 'PASSWORD_CHANGE', null, null);
    res.json({ ok: true });
}));
exports.default = router;
