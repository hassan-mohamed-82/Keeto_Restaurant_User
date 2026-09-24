"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const Report_1 = require("../../controllers/admin/Report");
const validation_1 = require("../../middlewares/validation");
const report_1 = require("../../validation/admin/report");
const router = (0, express_1.Router)();
// تقرير المطعم الخاص بيّا (للأدمن بتاع المطعم)
// GET /report/my-restaurant?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/my-restaurant", (0, catchAsync_1.catchAsync)(Report_1.getMyRestaurantReport));
router.get("/payment-method", (0, catchAsync_1.catchAsync)(Report_1.getOrdersByPaymentMethod));
// تقرير الفيزا (جميع طلبات الفيزا نجاح وفشل افتراضياً، مع إمكانية الفلترة بـ success أو failed)
// GET /report/visa?status=success|failed&startDate=...&endDate=...&branchId=...
router.get("/visa", (0, validation_1.validate)(report_1.reportVisaQuerySchema, "query"), (0, catchAsync_1.catchAsync)(Report_1.getVisaReport));
// تحميل كشف حساب المطعم كـ PDF
//GET /report/my-restaurant/invoice?startDate=2026-01-01&endDate=2026-05-19
router.get("/my-restaurant/:invoiceId/invoice", (0, catchAsync_1.catchAsync)(Report_1.downloadSavedInvoicePDF));
router.get("/my-invoices", (0, catchAsync_1.catchAsync)(Report_1.getMyInvoices));
// Dashboard Analytics
// GET /report/dashboard?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/dashboard", (0, catchAsync_1.catchAsync)(Report_1.getDashboardReports));
// // تقرير تفصيلي لكل المطاعم (للسوبر أدمن)
// // GET /report/all?startDate=2026-01-01&endDate=2026-05-19
// router.get("/all", catchAsync(getDetailedRestaurantReport));
exports.default = router;
