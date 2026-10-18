import { Router } from "express";
import {
    getAssignedOrders,
    getOrderHistory,
    updateOrderStatusToDelivered,
    markOrderPickedUp,
    markOrderDelivered,
    rejectOrderCourierEndpoint,
} from "../../controllers/delivery_man/order";
import { validate } from "../../middlewares/validation";
import {
    deliveryManAssignedOrdersQuerySchema,
    deliveryManOrderHistoryQuerySchema,
    deliveryManUpdateOrderStatusSchema,
    rejectOrderSchema,
} from "../../validation/delivery_man/order";

const router = Router();

// - Returns all active assigned orders
// - Optional query: ?orderId=<uuid> returns full details of that specific order
router.get("/assigned", validate(deliveryManAssignedOrdersQuerySchema, "query"), getAssignedOrders);

router.get("/history", validate(deliveryManOrderHistoryQuerySchema, "query"), getOrderHistory);

// Status update (PATCH for backward compatibility, POST /delivered for shipping consistency)
router.patch("/:orderId/status", validate(deliveryManUpdateOrderStatusSchema), updateOrderStatusToDelivered);
router.post("/:orderId/picked-up", markOrderPickedUp);
router.post("/:orderId/delivered", markOrderDelivered);
router.post("/:orderId/reject", validate(rejectOrderSchema), rejectOrderCourierEndpoint);

export default router;
