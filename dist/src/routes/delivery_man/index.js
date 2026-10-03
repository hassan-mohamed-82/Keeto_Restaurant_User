"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticated_1 = require("../../middlewares/authenticated");
const authorizedDeliveryMan_1 = require("../../middlewares/authorizedDeliveryMan");
const auth_1 = __importDefault(require("./auth"));
const dashboard_1 = __importDefault(require("./dashboard"));
const orders_1 = __importDefault(require("./orders"));
const profile_1 = __importDefault(require("./profile"));
const notifications_1 = __importDefault(require("./notifications"));
const router = (0, express_1.Router)();
// Public: Login (no auth required)
router.use("/auth", auth_1.default);
// All routes below require authentication and delivery_man role
router.use(authenticated_1.authenticated, (0, authorizedDeliveryMan_1.authorizedDeliveryMan)());
router.use("/dashboard", dashboard_1.default);
router.use("/orders", orders_1.default);
router.use("/profile", profile_1.default);
router.use("/notifications", notifications_1.default);
exports.default = router;
