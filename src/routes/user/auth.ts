import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    signup,
    verifyEmail,
    login,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    
} from "../../controllers/user/auth";
import { verifyGoogleToken } from "../../config/passport";
import { verifyFacebookToken } from "../../config/facebook";

const router = Router();

router.post("/signup", catchAsync(signup));
router.get("/verify-email", catchAsync(verifyEmail));
router.post("/login", catchAsync(login));
router.post("/forgot-password", catchAsync(forgotPassword));
router.post("/verify-reset-code", catchAsync(verifyResetCode));
router.post("/reset-password", catchAsync(resetPassword));
// router.post("/google", verifyGoogleToken);
// router.post("/facebook", verifyFacebookToken);
export default router;
