"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const order_1 = require("../../controllers/admin/order");
const router = (0, express_1.Router)();
// ✅ Get reasons - يحتاج صلاحية read
router.get("/reasons", (0, hasPermission_1.hasPermission)("orders", "read"), (0, catchAsync_1.catchAsync)(order_1.getReasons));
router.get("/numbers", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getallnumbersoforders));
// ✅ كل الأوردرات - يحتاج صلاحية read + التحقق من الفرع
router.get("/", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getRestaurantOrders));
// ✅ أوردرات بحالة معينة - يحتاج صلاحية read + التحقق من الفرع
router.get("/pending", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getPendingOrders));
router.get("/accepted", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getAcceptedOrders));
router.get("/preparing", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getPreparingOrders));
router.get("/out-for-delivery", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getOutForDeliveryOrders));
router.get("/delivered", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getDeliveredOrders));
router.get("/cancelled", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getCancelledOrders));
router.get("/rejected", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getRejectedOrders));
router.get("/refund", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getRefundOrders));
// ✅ تفاصيل أوردر بالـ ID - يحتاج صلاحية read + التحقق من الفرع
router.get("/:id", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.getRestaurantOrderById));
// ✅ تحميل الفاتورة (Receipt PDF) للأوردر
router.get("/:orderId/invoice", (0, hasPermission_1.hasPermission)("orders", "read", true), (0, catchAsync_1.catchAsync)(order_1.generateOrderInvoicePDF));
// ✅ تحديث حالة الأوردر - يحتاج صلاحية update + التحقق من الفرع
router.put("/:orderId", (0, hasPermission_1.hasPermission)("orders", "update", true), (0, catchAsync_1.catchAsync)(order_1.updateOrderStatus));
// ✅ الحصول على أرقام جميع الأوردرات (عدادات حسب الحالة)
exports.default = router;
