import { Router } from "express";
import { getProfile, updateProfile, changePassword } from "../../controllers/admin/profile";
import { updateFcmToken } from "../../controllers/admin/fcmToken";
import { catchAsync } from "../../utils/catchAsync";

const router = Router();

router.get("/", catchAsync(getProfile));
router.put("/", catchAsync(updateProfile));
router.put("/change-password", catchAsync(changePassword));
router.put("/fcm-token", catchAsync(updateFcmToken));

export default router; 