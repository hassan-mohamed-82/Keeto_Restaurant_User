import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { 
    getMyRestaurantReport,
    downloadSavedInvoicePDF,
    getMyInvoices, 
    getDashboardReports, 
    getOrdersByPaymentMethod,
    getVisaReport,
    getDeliveryManReport,
    getFoodReport,
} from "../../controllers/admin/Report";
import { validate } from "../../middlewares/validation";
import { reportVisaQuerySchema, deliveryManReportQuerySchema, foodReportQuerySchema } from "../../validation/admin/report";

const router = Router();

// تقرير المطعم الخاص بيّا (للأدمن بتاع المطعم)
// GET /report/my-restaurant?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/my-restaurant", catchAsync(getMyRestaurantReport));

router.get("/payment-method", catchAsync(getOrdersByPaymentMethod));

// تقرير الفيزا (جميع طلبات الفيزا نجاح وفشل افتراضياً، مع إمكانية الفلترة بـ success أو failed)
// GET /report/visa?status=success|failed&startDate=...&endDate=...&branchId=...
router.get("/visa", validate(reportVisaQuerySchema, "query"), catchAsync(getVisaReport));

// GET /report/delivery-man?deliveryManId=...&startDate=...&endDate=...&branchId=...&status=...
router.get("/delivery-man", validate(deliveryManReportQuerySchema, "query"), catchAsync(getDeliveryManReport));

// تقرير مبيعات الأكلات وخيارات الفارييشن (Food & Variations Sales Report)
// GET /report/food?startDate=...&endDate=...&branchId=...&arrangedType=desc|asc|ascn
router.get("/food", validate(foodReportQuerySchema, "query"), catchAsync(getFoodReport));

// تحميل كشف حساب المطعم كـ PDF
//GET /report/my-restaurant/invoice?startDate=2026-01-01&endDate=2026-05-19

router.get("/my-restaurant/:invoiceId/invoice", catchAsync(downloadSavedInvoicePDF));

router.get("/my-invoices", catchAsync(getMyInvoices));

// Dashboard Analytics
// GET /report/dashboard?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/dashboard", catchAsync(getDashboardReports));
// // تقرير تفصيلي لكل المطاعم (للسوبر أدمن)
// // GET /report/all?startDate=2026-01-01&endDate=2026-05-19
// router.get("/all", catchAsync(getDetailedRestaurantReport));

export default router;
