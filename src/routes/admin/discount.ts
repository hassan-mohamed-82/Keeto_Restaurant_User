import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    createDiscount,
    getAllDiscounts,
    getDiscountById,
    updateDiscount,
    deleteDiscount,
    toggleDiscountStatus,
} from "../../controllers/admin/discount";

const router = Router();

// CRUD
router.post("/", catchAsync(createDiscount));
router.get("/", catchAsync(getAllDiscounts));
router.get("/:id", catchAsync(getDiscountById));
router.put("/:id", catchAsync(updateDiscount));
router.put("/:id/toggle-status", catchAsync(toggleDiscountStatus));
router.delete("/:id", catchAsync(deleteDiscount));

export default router;
