import { Router } from "express";
import { getProfile, updateProfile, changePassword } from "../../controllers/admin/profile";
import { catchAsync } from "../../utils/catchAsync";
import { updateAdminFcmToken } from "../../controllers/admin/fcmToken";

const router = Router();

router.get("/", catchAsync(getProfile));
router.put("/", catchAsync(updateProfile));
router.put("/change-password", catchAsync(changePassword));
router.put("/fcm-token", catchAsync(updateAdminFcmToken));

export default router; 