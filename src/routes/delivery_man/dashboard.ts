import { Router } from "express";
import { getDashboard } from "../../controllers/delivery_man/dashboard";
import { validate } from "../../middlewares/validation";
import { deliveryManDashboardQuerySchema } from "../../validation/delivery_man/dashboard";

const router = Router();

// Summary: cashOnHand, totalAssignedOrders, deliveredOrders, cancelledRefundOrders
router.get("/", validate(deliveryManDashboardQuerySchema, "query"), getDashboard);

export default router;
