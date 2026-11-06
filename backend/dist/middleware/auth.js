"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = exports.AUDIT_READ = exports.ADMIN_ONLY = exports.SUPERVISOR_UP = exports.WRITE_ROLES = exports.ALL_ROLES = void 0;
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../lib/jwt");
const errors_1 = require("../lib/errors");
Object.defineProperty(exports, "asyncHandler", { enumerable: true, get: function () { return errors_1.asyncHandler; } });
function authenticate(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return next(errors_1.err.unauthorized('Missing or malformed Authorization header'));
    }
    const token = header.slice(7);
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = payload;
        next();
    }
    catch {
        return next(errors_1.err.unauthorized('Invalid or expired access token'));
    }
}
function requireRole(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            return next(errors_1.err.unauthorized());
        if (!roles.includes(req.user.role)) {
            return next(errors_1.err.forbidden(`Role '${req.user.role}' is not permitted for this action`));
        }
        next();
    };
}
exports.ALL_ROLES = ['admin', 'supervisor', 'operator', 'auditor'];
exports.WRITE_ROLES = ['admin', 'supervisor', 'operator'];
exports.SUPERVISOR_UP = ['admin', 'supervisor'];
exports.ADMIN_ONLY = ['admin'];
exports.AUDIT_READ = ['admin', 'auditor'];
