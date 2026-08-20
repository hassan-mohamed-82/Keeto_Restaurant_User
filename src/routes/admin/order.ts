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
    getReasons,
    getRefundOrders,
    generateOrderInvoicePDF,
    getallnumbersoforders,
    assignDelivery,
    selectDeliveryMan,
    setOrderPreparingDuration,
    getSelectData
} from "../../controllers/admin/order";

const router = Router();

// ✅ Get reasons - يحتاج صلاحية read
router.get("/reasons", hasPermission("orders", "read"), catchAsync(getReasons));
router.get("/numbers", hasPermission("orders", "read", true), catchAsync(getallnumbersoforders));
router.get("/select", hasPermission("orders", "read", true), catchAsync(selectDeliveryMan))
router.get("/select-data", hasPermission("orders", "read", true), catchAsync(getSelectData))

// ✅ كل الأوردرات - يحتاج صلاحية read + التحقق من الفرع
router.get("/", hasPermission("orders", "read", true), catchAsync(getRestaurantOrders));

// ✅ أوردرات بحالة معينة - يحتاج صلاحية read + التحقق من الفرع
router.get("/pending", hasPermission("orders", "read", true), catchAsync(getPendingOrders));
router.get("/accepted", hasPermission("orders", "read", true), catchAsync(getAcceptedOrders));
router.get("/preparing", hasPermission("orders", "read", true), catchAsync(getPreparingOrders));
router.get("/out-for-delivery", hasPermission("orders", "read", true), catchAsync(getOutForDeliveryOrders));
router.get("/delivered", hasPermission("orders", "read", true), catchAsync(getDeliveredOrders));
router.get("/cancelled", hasPermission("orders", "read", true), catchAsync(getCancelledOrders));
router.get("/refund", hasPermission("orders", "read", true), catchAsync(getRefundOrders));

// ✅ تفاصيل أوردر بالـ ID - يحتاج صلاحية read + التحقق من الفرع
router.get("/:id", hasPermission("orders", "read", true), catchAsync(getRestaurantOrderById));

// ✅ تحميل الفاتورة (Receipt PDF) للأوردر
router.get("/:orderId/invoice", hasPermission("orders", "read", true), catchAsync(generateOrderInvoicePDF));

// ✅ تحديث حالة الأوردر - يحتاج صلاحية update + التحقق من الفرع
router.put("/:orderId", hasPermission("orders", "update", true), catchAsync(updateOrderStatus));

// ✅ تعيين مندوب توصيل لطلب - يحتاج صلاحية update
router.put("/:orderId/assign-delivery", hasPermission("orders", "update", true), catchAsync(assignDelivery));

// ✅ تحديث مدة تحضير الأوردر (بـ دقائق) - يحتاج صلاحية update
router.put("/:orderId/duration", hasPermission("orders", "update", true), catchAsync(setOrderPreparingDuration));

export default router;