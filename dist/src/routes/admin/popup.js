"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const popup_1 = require("../../validation/admin/popup");
const popup_2 = require("../../controllers/admin/popup");
const router = (0, express_1.Router)();
// Options / Link target constants & items
router.get("/link-options", (0, catchAsync_1.catchAsync)(popup_2.getLinkTargetOptions));
// CRUD
router.post("/", (0, validation_1.validate)(popup_1.createPopupSchema), (0, catchAsync_1.catchAsync)(popup_2.createPopup));
router.get("/", (0, catchAsync_1.catchAsync)(popup_2.getAllPopups));
router.get("/:id", (0, catchAsync_1.catchAsync)(popup_2.getPopupById));
router.put("/:id", (0, validation_1.validate)(popup_1.updatePopupSchema), (0, catchAsync_1.catchAsync)(popup_2.updatePopup));
router.delete("/:id", (0, catchAsync_1.catchAsync)(popup_2.deletePopup));
// Toggle active/inactive
router.patch("/:id/toggle-status", (0, catchAsync_1.catchAsync)(popup_2.togglePopupStatus));
exports.default = router;
