import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { createCashier, getCashiers, getCashierById, updateCashier, deleteCashier,getActiveCashiers } from "../../controllers/admin/cashier";

const router = Router();
router.get("/active", catchAsync(getActiveCashiers));
router.post("/", catchAsync(createCashier));
router.get("/", catchAsync(getCashiers));
router.get("/:id", catchAsync(getCashierById));
router.put("/:id", catchAsync(updateCashier));
router.delete("/:id", catchAsync(deleteCashier));

export default router;
