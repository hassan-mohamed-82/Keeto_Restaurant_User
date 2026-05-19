"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const popup_1 = require("../../controllers/admin/popup");
const router = (0, express_1.Router)();
// CRUD
router.post("/", (0, catchAsync_1.catchAsync)(popup_1.createPopup));
router.get("/", (0, catchAsync_1.catchAsync)(popup_1.getAllPopups));
router.get("/:id", (0, catchAsync_1.catchAsync)(popup_1.getPopupById));
router.put("/:id", (0, catchAsync_1.catchAsync)(popup_1.updatePopup));
router.delete("/:id", (0, catchAsync_1.catchAsync)(popup_1.deletePopup));
// Toggle active/inactive
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(popup_1.togglePopupStatus));
exports.default = router;
