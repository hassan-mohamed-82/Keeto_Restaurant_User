"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const orderDelayAlert_1 = require("../../validation/admin/orderDelayAlert");
const orderDelayAlert_2 = require("../../controllers/admin/orderDelayAlert");
const router = (0, express_1.Router)();
// 1. Create alert group
router.post("/", (0, validation_1.validate)(orderDelayAlert_1.createOrderDelayAlertGroupSchema), (0, catchAsync_1.catchAsync)(orderDelayAlert_2.createAlertGroup));
// 2. Get all alert groups
router.get("/", (0, catchAsync_1.catchAsync)(orderDelayAlert_2.getAllAlertGroups));
// 3. Get alert group by ID
router.get("/:id", (0, catchAsync_1.catchAsync)(orderDelayAlert_2.getAlertGroupById));
// 4. Update alert group
router.put("/:id", (0, validation_1.validate)(orderDelayAlert_1.updateOrderDelayAlertGroupSchema), (0, catchAsync_1.catchAsync)(orderDelayAlert_2.updateAlertGroup));
// 5. Toggle active status
router.put("/:id/toggle-status", (0, catchAsync_1.catchAsync)(orderDelayAlert_2.toggleAlertGroupStatus));
// 6. Delete alert group
router.delete("/:id", (0, catchAsync_1.catchAsync)(orderDelayAlert_2.deleteAlertGroup));
exports.default = router;
