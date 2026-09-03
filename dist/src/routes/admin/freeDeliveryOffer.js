"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const freeDeliveryOffer_1 = require("../../controllers/admin/freeDeliveryOffer");
const router = (0, express_1.Router)();
// ✅ Get current free delivery offer for restaurant
router.get("/", (0, hasPermission_1.hasPermission)("orders", "read"), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_1.getFreeDeliveryOffer));
// ✅ Create / Update free delivery offer for restaurant
router.post("/", (0, hasPermission_1.hasPermission)("orders", "update"), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_1.upsertFreeDeliveryOffer));
// ✅ Delete / Reset free delivery offer
router.delete("/", (0, hasPermission_1.hasPermission)("orders", "delete"), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_1.deleteFreeDeliveryOffer));
exports.default = router;
