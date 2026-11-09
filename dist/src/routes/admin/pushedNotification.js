"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const pushedNotification_1 = require("../../validation/admin/pushedNotification");
const pushedNotification_2 = require("../../controllers/admin/pushedNotification");
const router = (0, express_1.Router)();
// List all pushed notifications for this restaurant
router.get("/", (0, catchAsync_1.catchAsync)(pushedNotification_2.getPushedNotifications));
// Create a new pushed notification (pushed_now or scheduled)
router.post("/", (0, validation_1.validate)(pushedNotification_1.createPushedNotificationSchema), (0, catchAsync_1.catchAsync)(pushedNotification_2.createPushedNotification));
// Get a single pushed notification by ID
router.get("/:id", (0, catchAsync_1.catchAsync)(pushedNotification_2.getPushedNotificationById));
// Update a pushed notification (only allowed before it has been sent)
router.put("/:id", (0, validation_1.validate)(pushedNotification_1.updatePushedNotificationSchema), (0, catchAsync_1.catchAsync)(pushedNotification_2.updatePushedNotification));
// Delete a pushed notification
router.delete("/:id", (0, catchAsync_1.catchAsync)(pushedNotification_2.deletePushedNotification));
// Manually dispatch a scheduled notification immediately
router.post("/:id/send-now", (0, catchAsync_1.catchAsync)(pushedNotification_2.sendPushedNotificationNow));
exports.default = router;
