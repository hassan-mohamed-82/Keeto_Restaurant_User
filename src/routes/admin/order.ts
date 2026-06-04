import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    getRestaurantOrders,
    getRestaurantOrderById,
    updateOrderStatus,
    getPendingOrders,
    getAcceptedOrders,
    getPreparingOrders,
    getOutForDeliveryOrders,
    getDeliveredOrders,
    getCancelledOrders,
    getRejectedOrders,
    getReasons,
    getRefundOrders,
    generateOrderInvoicePDF
} from "../../controllers/admin/order";
import { authorizeRoles } from "../../middlewares/authorized";

const router = Router();

// ✅ Get reasons - يحتاج صلاحية read
router.get("/reasons",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read"), catchAsync(getReasons));

// ✅ كل الأوردرات - يحتاج صلاحية read + التحقق من الفرع
router.get("/", authorizeRoles("branch_manager","staff"),hasPermission("orders", "read", true), catchAsync(getRestaurantOrders));

// ✅ أوردرات بحالة معينة - يحتاج صلاحية read + التحقق من الفرع
router.get("/pending", authorizeRoles("branch_manager","staff"),hasPermission("orders", "read", true), catchAsync(getPendingOrders));
router.get("/accepted",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getAcceptedOrders));
router.get("/preparing",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getPreparingOrders));
router.get("/out-for-delivery",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getOutForDeliveryOrders));
router.get("/delivered",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getDeliveredOrders));
router.get("/cancelled",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getCancelledOrders));
router.get("/rejected",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getRejectedOrders));
router.get("/refund",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getRefundOrders));

// ✅ تفاصيل أوردر بالـ ID - يحتاج صلاحية read + التحقق من الفرع
router.get("/:id",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(getRestaurantOrderById));

// ✅ تحميل الفاتورة (Receipt PDF) للأوردر
router.get("/:orderId/invoice",authorizeRoles("branch_manager","staff"), hasPermission("orders", "read", true), catchAsync(generateOrderInvoicePDF));

// ✅ تحديث حالة الأوردر - يحتاج صلاحية update + التحقق من الفرع
router.put("/:orderId", authorizeRoles("branch_manager","staff"),hasPermission("orders", "update", true), catchAsync(updateOrderStatus));

export default router;