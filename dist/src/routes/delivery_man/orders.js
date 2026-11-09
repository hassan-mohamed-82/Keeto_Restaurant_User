"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_1 = require("../../controllers/delivery_man/order");
const validation_1 = require("../../middlewares/validation");
const order_2 = require("../../validation/delivery_man/order");
const router = (0, express_1.Router)();
// - Returns all active assigned orders
// - Optional query: ?orderId=<uuid> returns full details of that specific order
router.get("/assigned", (0, validation_1.validate)(order_2.deliveryManAssignedOrdersQuerySchema, "query"), order_1.getAssignedOrders);
router.get("/history", (0, validation_1.validate)(order_2.deliveryManOrderHistoryQuerySchema, "query"), order_1.getOrderHistory);
// Status update (PATCH for backward compatibility, POST /delivered for shipping consistency)
router.patch("/:orderId/status", (0, validation_1.validate)(order_2.deliveryManUpdateOrderStatusSchema), order_1.updateOrderStatusToDelivered);
router.post("/:orderId/picked-up", order_1.markOrderPickedUp);
router.post("/:orderId/delivered", order_1.markOrderDelivered);
router.post("/:orderId/reject", (0, validation_1.validate)(order_2.rejectOrderSchema), order_1.rejectOrderCourierEndpoint);
exports.default = router;
