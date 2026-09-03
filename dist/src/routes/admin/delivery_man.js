"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hasPermission_1 = require("../../middlewares/hasPermission");
const delivery_man_1 = require("../../controllers/admin/delivery_man");
const catchAsync_1 = require("../../utils/catchAsync");
const router = (0, express_1.Router)();
// ✅ Create delivery man - يحتاج صلاحية create (delivery_man module)
router.post("/", (0, hasPermission_1.hasPermission)("delivery_man", "create"), (0, catchAsync_1.catchAsync)(delivery_man_1.createDeliveryMan));
// ✅ Get all delivery men - يحتاج صلاحية read
router.get("/", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, catchAsync_1.catchAsync)(delivery_man_1.getDeliveryMen));
// ✅ Get delivery man by id - يحتاج صلاحية read
router.get("/:id", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, catchAsync_1.catchAsync)(delivery_man_1.getDeliveryManById));
// ✅ Update delivery man - يحتاج صلاحية update
router.put("/:id", (0, hasPermission_1.hasPermission)("delivery_man", "update"), (0, catchAsync_1.catchAsync)(delivery_man_1.updateDeliveryMan));
// ✅ Delete delivery man - يحتاج صلاحية delete
router.delete("/:id", (0, hasPermission_1.hasPermission)("delivery_man", "delete"), (0, catchAsync_1.catchAsync)(delivery_man_1.deleteDeliveryMan));
exports.default = router;
