"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const validation_1 = require("../../middlewares/validation");
const freeDeliveryOffer_1 = require("../../validation/admin/freeDeliveryOffer");
const freeDeliveryOffer_2 = require("../../controllers/admin/freeDeliveryOffer");
const router = (0, express_1.Router)();
// ✅ Get current free delivery offer for restaurant
router.get("/", (0, hasPermission_1.hasPermission)("order", "read"), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_2.getFreeDeliveryOffer));
// ✅ Create / Update free delivery offer for restaurant
router.post("/", (0, hasPermission_1.hasPermission)("order", "update"), (0, validation_1.validate)(freeDeliveryOffer_1.upsertFreeDeliveryOfferSchema), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_2.upsertFreeDeliveryOffer));
// ✅ Delete / Reset free delivery offer
router.delete("/", (0, hasPermission_1.hasPermission)("order", "delete"), (0, catchAsync_1.catchAsync)(freeDeliveryOffer_2.deleteFreeDeliveryOffer));
exports.default = router;
