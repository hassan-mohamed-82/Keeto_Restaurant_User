"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const hasPermission_1 = require("../../middlewares/hasPermission");
const delivery_man_1 = require("../../controllers/admin/delivery_man");
const catchAsync_1 = require("../../utils/catchAsync");
const validation_1 = require("../../middlewares/validation");
const delivery_man_2 = require("../../validation/admin/delivery_man");
const router = (0, express_1.Router)();
// ✅ Get assignable orders (pending / accepted / preparing)
router.get("/pending-orders", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, catchAsync_1.catchAsync)(delivery_man_1.getPendingOrders));
// ✅ Assign orders to a delivery man
router.post("/assign-orders", (0, hasPermission_1.hasPermission)("delivery_man", "update"), (0, validation_1.validate)(delivery_man_2.assignOrdersSchema), (0, catchAsync_1.catchAsync)(delivery_man_1.assignOrdersToDeliveryMan));
// ✅ Get all delivery men with their assigned orders + totals
router.get("/assigned-orders", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, catchAsync_1.catchAsync)(delivery_man_1.getDeliveryMenWithOrders));
// ✅ Get delivery orders (out_for_delivery / delivered) with cash-on-hand & financial stats
router.get("/delivery-orders", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, validation_1.validate)(delivery_man_2.getDeliveryOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(delivery_man_1.getDeliveryOrders));
// ✅ Get cash delivery orders for cash settlement (filter by deliveryManId, view uncollected vs collected)
router.get("/collect-cash", (0, hasPermission_1.hasPermission)("delivery_man", "read"), (0, validation_1.validate)(delivery_man_2.getDeliveryCashOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(delivery_man_1.getDeliveryCashOrders));
// ✅ Collect delivery cash from delivery man (mark orders as cash collected by admin)
router.post("/collect-cash", (0, hasPermission_1.hasPermission)("delivery_man", "update"), (0, validation_1.validate)(delivery_man_2.collectDeliveryCashSchema, "body"), (0, catchAsync_1.catchAsync)(delivery_man_1.collectDeliveryCash));
// ✅ Create delivery man
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
