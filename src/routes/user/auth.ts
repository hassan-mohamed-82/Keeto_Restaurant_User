import { Router } from "express";
import rateLimit from "express-rate-limit";
import { catchAsync } from "../../utils/catchAsync";
import {
    signup,
    verifyEmail,
    login,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    initGuestSession,
} from "../../controllers/user/auth";
import { verifyGoogleToken } from "../../config/passport";
import { verifyFacebookToken } from "../../config/facebook";

const router = Router();

// 🛡️ Rate limiter for endpoints that send emails — prevents SMTP abuse
const emailRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,                    // max 5 requests per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests. Please try again after 15 minutes." },
});

// 🛡️ Rate limiter for login — prevents brute force
const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,                   // max 10 login attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Please try again after 15 minutes." },
});

router.post("/signup", emailRateLimit, catchAsync(signup));
router.get("/verify-email", catchAsync(verifyEmail));
router.post("/login", loginRateLimit, catchAsync(login));
router.post("/forgot-password", emailRateLimit, catchAsync(forgotPassword));
router.post("/verify-reset-code", catchAsync(verifyResetCode));
router.post("/reset-password", catchAsync(resetPassword));

// 🌐 Public: initialize a guest session — no auth required
router.post("/guest-session", catchAsync(initGuestSession));

// router.post("/google", verifyGoogleToken);
// router.post("/facebook", verifyFacebookToken);
export default router;
