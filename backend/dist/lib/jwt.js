"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.REFRESH_TTL_MS = exports.REFRESH_TTL = exports.ACCESS_TTL = void 0;
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashRefreshToken = hashRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
function loadSecret(name, developmentFallback) {
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
exports.ACCESS_TTL = '15m';
exports.REFRESH_TTL = '7d';
exports.REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function signAccessToken(p) {
    return jsonwebtoken_1.default.sign(p, ACCESS_SECRET, { expiresIn: exports.ACCESS_TTL });
}
function signRefreshToken(userId, jti) {
    const tokenJti = jti || crypto_1.default.randomBytes(16).toString('hex');
    const token = jsonwebtoken_1.default.sign({ sub: userId, jti: tokenJti, type: 'refresh' }, REFRESH_SECRET, {
        expiresIn: exports.REFRESH_TTL,
    });
    return { token, jti: tokenJti };
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
}
/** Store only a hash of the refresh token (never the token itself). */
function hashRefreshToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
