import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { getRestaurantOrders ,getRestaurantOrderById, updateOrderStatus } from "../../controllers/admin/order";
const router = Router();
router.get("/", catchAsync(getRestaurantOrders));
router.get("/id", catchAsync(getRestaurantOrderById));
router.put("/:orderId", catchAsync(updateOrderStatus));
export default router;