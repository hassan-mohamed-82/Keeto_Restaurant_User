"use strict";
// src/middlewares/authorizedCashier.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizedCashier = void 0;
const Errors_1 = require("../Errors");
const authorizedCashier = () => {
    return (req, res, next) => {
        if (!req.user) {
            throw new Errors_1.UnauthorizedError("Not authenticated");
        }
        const userRole = (req.user.type || req.user.role);
        if (userRole !== "cashier") {
            throw new Errors_1.UnauthorizedError("You don't have permission to access this resource");
        }
        next();
    };
};
exports.authorizedCashier = authorizedCashier;
