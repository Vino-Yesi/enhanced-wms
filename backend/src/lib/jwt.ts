import jwt from 'jsonwebtoken';
import crypto from 'crypto';

function loadSecret(name: string, developmentFallback: string): string {
  const secret = process.env[name];
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error(`${name} must be configured with at least 32 characters in production`);
  }
  if (secret && secret.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return secret || developmentFallback;
}

const ACCESS_SECRET = loadSecret('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-00000000');
const REFRESH_SECRET = loadSecret('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-00000000');

export const ACCESS_TTL = '15m';
export const REFRESH_TTL = '7d';
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AccessPayload {
  sub: number;
  username: string;
  role: string;
  displayName: string;
}

export function signAccessToken(p: AccessPayload): string {
  return jwt.sign(p, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(userId: number, jti?: string): { token: string; jti: string } {
  const tokenJti = jti || crypto.randomBytes(16).toString('hex');
  const token = jwt.sign({ sub: userId, jti: tokenJti, type: 'refresh' }, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL,
  });
  return { token, jti: tokenJti };
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, ACCESS_SECRET) as unknown as AccessPayload;
}

export function verifyRefreshToken(token: string): { sub: number; jti: string } {
  return jwt.verify(token, REFRESH_SECRET) as unknown as { sub: number; jti: string };
}

/** Store only a hash of the refresh token (never the token itself). */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
