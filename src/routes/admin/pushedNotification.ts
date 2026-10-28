import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { validate } from "../../middlewares/validation";
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
router.get("/", catchAsync(getPushedNotifications));

// Create a new pushed notification (pushed_now or scheduled)
router.post(
    "/",
    validate(createPushedNotificationSchema),
    catchAsync(createPushedNotification)
);

// Get a single pushed notification by ID
router.get("/:id", catchAsync(getPushedNotificationById));

// Update a pushed notification (only allowed before it has been sent)
router.put(
    "/:id",
    validate(updatePushedNotificationSchema),
    catchAsync(updatePushedNotification)
);

// Delete a pushed notification
router.delete("/:id", catchAsync(deletePushedNotification));

// Manually dispatch a scheduled notification immediately
router.post("/:id/send-now", catchAsync(sendPushedNotificationNow));

export default router;
