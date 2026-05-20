import { Router } from "express";
import { getProfile, updateProfile } from "../../controllers/user/profile";
import { updateFcmToken } from "../../controllers/user/fcmToken";
import { authenticated } from "../../middlewares/authenticated";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();

router.get("/", authenticated, catchAsync(getProfile));
router.put("/", authenticated, catchAsync(updateProfile));
router.put("/fcm-token", authenticated, catchAsync(updateFcmToken));

export default router;
