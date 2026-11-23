import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    createPushedNotificationSchema,
    updatePushedNotificationSchema,
} from "../../validation/admin/pushedNotification";
import {
    createPushedNotification,
    getPushedNotifications,
    getPushedNotificationById,
    updatePushedNotification,
    deletePushedNotification,
    sendPushedNotificationNow,
} from "../../controllers/admin/pushedNotification";

const router = Router();

// List all pushed notifications for this restaurant
router.get("/", hasPermission("pushnotification", "read"), catchAsync(getPushedNotifications));

// Create a new pushed notification (pushed_now or scheduled)
router.post(
    "/",
    hasPermission("pushnotification", "create"),
    validate(createPushedNotificationSchema),
    catchAsync(createPushedNotification)
);

// Get a single pushed notification by ID
router.get("/:id", hasPermission("pushnotification", "read"), catchAsync(getPushedNotificationById));

// Update a pushed notification (only allowed before it has been sent)
router.put(
    "/:id",
    hasPermission("pushnotification", "update"),
    validate(updatePushedNotificationSchema),
    catchAsync(updatePushedNotification)
);

// Delete a pushed notification
router.delete("/:id", hasPermission("pushnotification", "delete"), catchAsync(deletePushedNotification));

// Manually dispatch a scheduled notification immediately
router.post("/:id/send-now", hasPermission("pushnotification", "update"), catchAsync(sendPushedNotificationNow));

export default router;
