"use strict";
// src/middlewares/authorizedDeliveryMan.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizedDeliveryMan = void 0;
const Errors_1 = require("../Errors");
const authorizedDeliveryMan = () => {
    return (req, res, next) => {
        if (!req.user) {
            throw new Errors_1.UnauthorizedError("Not authenticated");
        }
        const userRole = req.user.type || req.user.role;
        if (userRole !== "delivery_man") {
            throw new Errors_1.UnauthorizedError("You don't have permission to access this resource");
        }
        next();
    };
};
exports.authorizedDeliveryMan = authorizedDeliveryMan;
