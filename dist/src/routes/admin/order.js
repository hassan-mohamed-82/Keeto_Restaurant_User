"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const order_1 = require("../../controllers/admin/order");
const router = (0, express_1.Router)();
// كل الأوردرات
router.get("/", (0, catchAsync_1.catchAsync)(order_1.getRestaurantOrders));
// أوردرات بحالة معينة
router.get("/pending", (0, catchAsync_1.catchAsync)(order_1.getPendingOrders));
router.get("/accepted", (0, catchAsync_1.catchAsync)(order_1.getAcceptedOrders));
router.get("/preparing", (0, catchAsync_1.catchAsync)(order_1.getPreparingOrders));
router.get("/out-for-delivery", (0, catchAsync_1.catchAsync)(order_1.getOutForDeliveryOrders));
router.get("/delivered", (0, catchAsync_1.catchAsync)(order_1.getDeliveredOrders));
router.get("/cancelled", (0, catchAsync_1.catchAsync)(order_1.getCancelledOrders));
router.get("/rejected", (0, catchAsync_1.catchAsync)(order_1.getRejectedOrders));
router.get("/refund", (0, catchAsync_1.catchAsync)(order_1.getRefundOrders));
// تفاصيل أوردر بالـ ID
router.get("/:id", (0, catchAsync_1.catchAsync)(order_1.getRestaurantOrderById));
// تحديث حالة الأوردر
router.put("/:orderId", (0, catchAsync_1.catchAsync)(order_1.updateOrderStatus));
exports.default = router;
