import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import { getOrderByRedeemCode, approveRedeemCode } from "../../controllers/admin/pointsOrders";

const router = Router();

router.get("/verify/:code", hasPermission("orders", "read"), catchAsync(getOrderByRedeemCode));
router.post("/approve", hasPermission("orders", "update"), catchAsync(approveRedeemCode));

export default router;