import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { 
    getMyNotifications, 
    markNotificationAsRead, 
    markAllNotificationsAsRead,
    getRepeatNotificationSettings,
    updateRepeatNotificationSettings
} from "../../controllers/admin/notification";

const router = Router();

router.get("/repeat-settings", catchAsync(getRepeatNotificationSettings));
router.put("/repeat-settings", catchAsync(updateRepeatNotificationSettings));

router.get("/", catchAsync(getMyNotifications));
router.put("/read-all", catchAsync(markAllNotificationsAsRead));
router.put("/:id/read", catchAsync(markNotificationAsRead));

export default router;
