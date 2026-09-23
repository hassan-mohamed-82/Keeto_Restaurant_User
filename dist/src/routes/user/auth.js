"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const auth_1 = require("../../controllers/user/auth");
const router = (0, express_1.Router)();
router.post("/signup", (0, catchAsync_1.catchAsync)(auth_1.signup));
router.get("/verify-email", (0, catchAsync_1.catchAsync)(auth_1.verifyEmail));
router.post("/login", (0, catchAsync_1.catchAsync)(auth_1.login));
router.post("/forgot-password", (0, catchAsync_1.catchAsync)(auth_1.forgotPassword));
router.post("/verify-reset-code", (0, catchAsync_1.catchAsync)(auth_1.verifyResetCode));
router.post("/reset-password", (0, catchAsync_1.catchAsync)(auth_1.resetPassword));
// 🌐 Public: initialize a guest session — no auth required
router.post("/guest-session", (0, catchAsync_1.catchAsync)(auth_1.initGuestSession));
// router.post("/google", verifyGoogleToken);
// router.post("/facebook", verifyFacebookToken);
exports.default = router;
