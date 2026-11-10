"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const validation_1 = require("../../middlewares/validation");
const order_1 = require("../../validation/admin/order");
const order_2 = require("../../controllers/admin/order");
const router = (0, express_1.Router)();
// ✅ Get reasons - يحتاج صلاحية read
router.get("/reasons", (0, hasPermission_1.hasPermission)("order", "read"), (0, catchAsync_1.catchAsync)(order_2.getReasons));
router.get("/numbers", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getallnumbersoforders));
router.get("/select", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(order_2.selectDeliveryMan));
router.get("/select-data", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(order_2.getSelectData));
router.get("/select-branches", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(order_2.getSelectBranches));
// ✅ كل الأوردرات - يحتاج صلاحية read + التحقق من الفرع
router.get("/", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getRestaurantOrders));
// ✅ أوردرات بحالة معينة - يحتاج صلاحية read + التحقق من الفرع
router.get("/pending", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getPendingOrders));
router.get("/accepted", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getAcceptedOrders));
router.get("/preparing", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getPreparingOrders));
router.get("/out-for-delivery", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getOutForDeliveryOrders));
router.get("/delivered", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getDeliveredOrders));
router.get("/cancelled", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getCancelledOrders));
router.get("/refund", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.getRefundOrders));
// ✅ بون تقرير الفواتير والمبيعات (Thermal Receipt) - يحتاج صلاحية read + التحقق من الفرع
router.get("/report-pdf", (0, hasPermission_1.hasPermission)("order", "read", true), (0, validation_1.validate)(order_1.getRestaurantOrdersQuerySchema, "query"), (0, catchAsync_1.catchAsync)(order_2.generateOrdersReportPDF));
// ✅ تفاصيل أوردر بالـ ID - يحتاج صلاحية read + التحقق من الفرع
router.get("/:id", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(order_2.getRestaurantOrderById));
// ✅ تحميل الفاتورة (Receipt PDF) للأوردر
router.get("/:orderId/invoice", (0, hasPermission_1.hasPermission)("order", "read", true), (0, catchAsync_1.catchAsync)(order_2.generateOrderInvoicePDF));
// ✅ تحويل الأوردر إلى فرع آخر - يحتاج صلاحية update
router.put("/:orderId/transfer-branch", (0, hasPermission_1.hasPermission)("order", "update"), (0, validation_1.validate)(order_1.transferOrderBranchSchema), (0, catchAsync_1.catchAsync)(order_2.transferOrderBranch));
// ✅ تحديث حالة الأوردر - يحتاج صلاحية update + التحقق من الفرع
router.put("/:orderId", (0, hasPermission_1.hasPermission)("order", "update", true), (0, catchAsync_1.catchAsync)(order_2.updateOrderStatus));
// ✅ تعيين مندوب توصيل لطلب - يحتاج صلاحية update
router.put("/:orderId/assign-delivery", (0, hasPermission_1.hasPermission)("order", "update", true), (0, catchAsync_1.catchAsync)(order_2.assignDelivery));
// ✅ تحديث مدة تحضير الأوردر (بـ دقائق) - يحتاج صلاحية update
router.put("/:orderId/duration", (0, hasPermission_1.hasPermission)("order", "update", true), (0, catchAsync_1.catchAsync)(order_2.setOrderPreparingDuration));
exports.default = router;
