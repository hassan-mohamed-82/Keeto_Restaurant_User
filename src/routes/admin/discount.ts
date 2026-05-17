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
router.delete("/:id", catchAsync(deleteDiscount));

// Toggle active/inactive
router.patch("/:id/toggle-status", catchAsync(toggleDiscountStatus));

export default router;
