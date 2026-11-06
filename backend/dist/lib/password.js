"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const argon2_1 = __importDefault(require("argon2"));
async function hashPassword(plain) {
    return argon2_1.default.hash(plain);
}
async function verifyPassword(hash, plain) {
    try {
        return await argon2_1.default.verify(hash, plain);
    }
    catch {
        return false;
    }
}
