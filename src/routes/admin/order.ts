import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
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
    getRefundOrders
} from "../../controllers/admin/order";

const router = Router();

// كل الأوردرات
router.get("/", catchAsync(getRestaurantOrders));

// أوردرات بحالة معينة
router.get("/pending", catchAsync(getPendingOrders));
router.get("/accepted", catchAsync(getAcceptedOrders));
router.get("/preparing", catchAsync(getPreparingOrders));
router.get("/out-for-delivery", catchAsync(getOutForDeliveryOrders));
router.get("/delivered", catchAsync(getDeliveredOrders));
router.get("/cancelled", catchAsync(getCancelledOrders));
router.get("/rejected", catchAsync(getRejectedOrders));
router.get("/refund", catchAsync(getRefundOrders));

// تفاصيل أوردر بالـ ID
router.get("/:id", catchAsync(getRestaurantOrderById));

// تحديث حالة الأوردر
router.put("/:orderId", catchAsync(updateOrderStatus));

export default router;