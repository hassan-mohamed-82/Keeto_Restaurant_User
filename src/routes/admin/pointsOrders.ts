import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import { getOrderByRedeemCode, approveRedeemCode } from "../../controllers/admin/pointsOrders";

const router = Router();

router.post("/", hasPermission("pointsOrders", "update"), catchAsync(approveRedeemCode));
router.get("/verify/:code", hasPermission("pointsOrders", "read"), catchAsync(getOrderByRedeemCode));

export default router;