"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const notification_1 = require("../../controllers/delivery_man/notification");
const validation_1 = require("../../middlewares/validation");
const notification_2 = require("../../validation/delivery_man/notification");
const router = (0, express_1.Router)();
// Optional query: ?page=1&limit=20&unreadOnly=true&isRead=false
router.get("/", (0, validation_1.validate)(notification_2.deliveryManNotificationQuerySchema, "query"), notification_1.getMyNotifications);
// PATCH /delivery-man/notifications/read-all
router.patch("/read-all", notification_1.markAllNotificationsAsRead);
// PATCH /delivery-man/notifications/:id/read
router.patch("/:id/read", notification_1.markNotificationAsRead);
exports.default = router;
