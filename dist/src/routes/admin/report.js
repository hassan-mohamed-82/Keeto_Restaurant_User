"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const Report_1 = require("../../controllers/admin/Report");
const router = (0, express_1.Router)();
// تقرير المطعم الخاص بيّا (للأدمن بتاع المطعم)
// GET /report/my-restaurant?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/my-restaurant", (0, catchAsync_1.catchAsync)(Report_1.getMyRestaurantReport));
// تحميل كشف حساب المطعم كـ PDF
//GET /report/my-restaurant/invoice?startDate=2026-01-01&endDate=2026-05-19
router.get("/my-restaurant/invoice", (0, catchAsync_1.catchAsync)(Report_1.downloadSavedInvoicePDF));
router.get("/my-invoices", (0, catchAsync_1.catchAsync)(Report_1.getMyInvoices));
// // تقرير تفصيلي لكل المطاعم (للسوبر أدمن)
// // GET /report/all?startDate=2026-01-01&endDate=2026-05-19
// router.get("/all", catchAsync(getDetailedRestaurantReport));
exports.default = router;
