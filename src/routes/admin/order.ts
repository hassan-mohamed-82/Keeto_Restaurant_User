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
router.get("/reasons", hasPermission("order", "read"), catchAsync(getReasons));
router.get("/numbers", hasPermission("order", "read", true), catchAsync(getallnumbersoforders));
router.get("/select", hasPermission("order", "read", true), catchAsync(selectDeliveryMan))
router.get("/select-data", hasPermission("order", "read", true), catchAsync(getSelectData))

// ✅ كل الأوردرات - يحتاج صلاحية read + التحقق من الفرع
router.get("/", hasPermission("order", "read", true), catchAsync(getRestaurantOrders));

// ✅ أوردرات بحالة معينة - يحتاج صلاحية read + التحقق من الفرع
router.get("/pending", hasPermission("order", "read", true), catchAsync(getPendingOrders));
router.get("/accepted", hasPermission("order", "read", true), catchAsync(getAcceptedOrders));
router.get("/preparing", hasPermission("order", "read", true), catchAsync(getPreparingOrders));
router.get("/out-for-delivery", hasPermission("order", "read", true), catchAsync(getOutForDeliveryOrders));
router.get("/delivered", hasPermission("order", "read", true), catchAsync(getDeliveredOrders));
router.get("/cancelled", hasPermission("order", "read", true), catchAsync(getCancelledOrders));
router.get("/refund", hasPermission("order", "read", true), catchAsync(getRefundOrders));

// ✅ تفاصيل أوردر بالـ ID - يحتاج صلاحية read + التحقق من الفرع
router.get("/:id", hasPermission("order", "read", true), catchAsync(getRestaurantOrderById));

// ✅ تحميل الفاتورة (Receipt PDF) للأوردر
router.get("/:orderId/invoice", hasPermission("order", "read", true), catchAsync(generateOrderInvoicePDF));

// ✅ تحديث حالة الأوردر - يحتاج صلاحية update + التحقق من الفرع
router.put("/:orderId", hasPermission("order", "update", true), catchAsync(updateOrderStatus));

// ✅ تعيين مندوب توصيل لطلب - يحتاج صلاحية update
router.put("/:orderId/assign-delivery", hasPermission("order", "update", true), catchAsync(assignDelivery));

// ✅ تحديث مدة تحضير الأوردر (بـ دقائق) - يحتاج صلاحية update
router.put("/:orderId/duration", hasPermission("order", "update", true), catchAsync(setOrderPreparingDuration));

export default router;