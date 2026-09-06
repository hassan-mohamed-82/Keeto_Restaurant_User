import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { 
    getMyNotifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead,
    getRepeatNotificationSettings,
    updateRepeatNotificationSettings
} from "../../controllers/admin/notification";
import { authenticated } from "../../middlewares/authenticated";

const router = Router();

router.get("/repeat-settings", catchAsync(getRepeatNotificationSettings));
router.put("/repeat-settings", catchAsync(updateRepeatNotificationSettings));

router.get("/", authenticated, catchAsync(getMyNotifications));
router.put("/read-all", authenticated, catchAsync(markAllNotificationsAsRead));
router.put("/:id/read", authenticated, catchAsync(markNotificationAsRead));

export default router;
