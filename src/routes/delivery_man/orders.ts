import { Router } from "express";
import {
    getAssignedOrders,
    getOrderHistory,
    updateOrderStatusToDelivered,
} from "../../controllers/delivery_man/order";
import { validate } from "../../middlewares/validation";
import {
    deliveryManAssignedOrdersQuerySchema,
    deliveryManOrderHistoryQuerySchema,
    deliveryManUpdateOrderStatusSchema,
} from "../../validation/delivery_man/order";

const router = Router();

// - Returns all active assigned orders
// - Optional query: ?orderId=<uuid> returns full details of that specific order
router.get("/assigned", validate(deliveryManAssignedOrdersQuerySchema, "query"), getAssignedOrders);

router.get("/history", validate(deliveryManOrderHistoryQuerySchema, "query"), getOrderHistory);

router.patch("/:orderId/status", validate(deliveryManUpdateOrderStatusSchema), updateOrderStatusToDelivered);

export default router;
