import { Router } from "express";
import {
    getMyNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
} from "../../controllers/delivery_man/notification";
import { validate } from "../../middlewares/validation";
import { deliveryManNotificationQuerySchema } from "../../validation/delivery_man/notification";

const router = Router();

// Optional query: ?page=1&limit=20&unreadOnly=true&isRead=false
router.get("/", validate(deliveryManNotificationQuerySchema, "query"), getMyNotifications);

// PATCH /delivery-man/notifications/read-all
router.patch("/read-all", markAllNotificationsAsRead);

// PATCH /delivery-man/notifications/:id/read
router.patch("/:id/read", markNotificationAsRead);

export default router;
