import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { getMyRestaurantReport,downloadMyRestaurantInvoicePDF } from "../../controllers/admin/Report";

const router = Router();

// تقرير المطعم الخاص بيّا (للأدمن بتاع المطعم)
// GET /report/my-restaurant?startDate=2026-01-01&endDate=2026-05-19&branchId=xxx
router.get("/my-restaurant", catchAsync(getMyRestaurantReport));

// تحميل كشف حساب المطعم كـ PDF
// GET /report/my-restaurant/invoice?startDate=2026-01-01&endDate=2026-05-19
router.get("/my-restaurant/invoice", catchAsync(downloadMyRestaurantInvoicePDF));

// // تقرير تفصيلي لكل المطاعم (للسوبر أدمن)
// // GET /report/all?startDate=2026-01-01&endDate=2026-05-19
// router.get("/all", catchAsync(getDetailedRestaurantReport));

export default router;
