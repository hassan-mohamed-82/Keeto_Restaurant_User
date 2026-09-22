import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { checkout, getOrderDetails, getActiveOrders,getOrderHistory } from "../../controllers/user/order";
import { validate } from "../../middlewares/validation";
import { checkoutSchema } from "../../validation/user/order";

const router = Router();
router.post("/checkout", validate(checkoutSchema), catchAsync(checkout));
router.get("/active", catchAsync(getActiveOrders));
router.get("/history", catchAsync(getOrderHistory));
router.get("/:orderId", catchAsync(getOrderDetails));
export default router;