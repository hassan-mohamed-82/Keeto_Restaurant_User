"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hasPermission_1 = require("../../middlewares/hasPermission");
const restrauntadmin_1 = require("../../controllers/admin/restrauntadmin");
const fcmToken_1 = require("../../controllers/admin/fcmToken");
const catchAsync_1 = require("../../utils/catchAsync");
const router = (0, express_1.Router)();
// ✅ Create staff - يحتاج صلاحية create (admins module)
router.post("/", (0, hasPermission_1.hasPermission)("admins", "create"), (0, catchAsync_1.catchAsync)(restrauntadmin_1.createStaff));
// ✅ Get all staff - يحتاج صلاحية read
router.get("/", (0, hasPermission_1.hasPermission)("admins", "read"), (0, catchAsync_1.catchAsync)(restrauntadmin_1.getAllStaff));
// ✅ Update FCM token - لا يحتاج صلاحيات (كل واحد يقدر يحدث token بتاعه)
router.put("/fcm-token", (0, catchAsync_1.catchAsync)(fcmToken_1.updateFcmToken));
// ✅ Update staff - يحتاج صلاحية update
router.put("/:id", (0, hasPermission_1.hasPermission)("admins", "update"), (0, catchAsync_1.catchAsync)(restrauntadmin_1.updateStaff));
// ✅ Delete staff - يحتاج صلاحية delete
router.delete("/:id", (0, hasPermission_1.hasPermission)("admins", "delete"), (0, catchAsync_1.catchAsync)(restrauntadmin_1.deleteStaff));
exports.default = router;
