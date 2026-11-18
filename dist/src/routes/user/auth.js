"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const catchAsync_1 = require("../../utils/catchAsync");
const auth_1 = require("../../controllers/user/auth");
const router = (0, express_1.Router)();
// 🛡️ Rate limiter for endpoints that send emails — prevents SMTP abuse
const emailRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // max 5 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again after 15 minutes." },
});
// 🛡️ Rate limiter for login — prevents brute force
const loginRateLimit = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // max 10 login attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please try again after 15 minutes." },
});
router.post("/signup", emailRateLimit, (0, catchAsync_1.catchAsync)(auth_1.signup));
router.get("/verify-email", (0, catchAsync_1.catchAsync)(auth_1.verifyEmail));
router.post("/login", loginRateLimit, (0, catchAsync_1.catchAsync)(auth_1.login));
router.post("/forgot-password", emailRateLimit, (0, catchAsync_1.catchAsync)(auth_1.forgotPassword));
router.post("/verify-reset-code", (0, catchAsync_1.catchAsync)(auth_1.verifyResetCode));
router.post("/reset-password", (0, catchAsync_1.catchAsync)(auth_1.resetPassword));
// 🌐 Public: initialize a guest session — no auth required
router.post("/guest-session", (0, catchAsync_1.catchAsync)(auth_1.initGuestSession));
// router.post("/google", verifyGoogleToken);
// router.post("/facebook", verifyFacebookToken);
exports.default = router;
