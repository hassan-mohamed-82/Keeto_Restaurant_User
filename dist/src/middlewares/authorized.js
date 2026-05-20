"use strict";
// src/middlewares/authorizeRoles.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = void 0;
const Errors_1 = require("../Errors");
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            throw new Errors_1.UnauthorizedError("Not authenticated");
        }
        // 🔄 2. تأمين الفحص: نقرأ الرتبة سواء كانت مخزنة في الـ Token باسم type أو role
        const userRole = (req.user.type || req.user.role);
        if (!roles.includes(userRole)) {
            throw new Errors_1.UnauthorizedError("You don't have permission to access this resource");
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
