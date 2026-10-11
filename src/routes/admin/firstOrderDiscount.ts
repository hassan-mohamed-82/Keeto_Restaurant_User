import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import {
    createFirstOrderDiscount,
    getAllFirstOrderDiscounts,
    getFirstOrderDiscountById,
    updateFirstOrderDiscount,
    deleteFirstOrderDiscount,
    toggleFirstOrderDiscountStatus,
    getFirstOrderDiscountUsages,
} from "../../controllers/admin/firstOrderDiscount";
import { validate } from "../../middlewares/validation";
import {
    createFirstOrderDiscountSchema,
    updateFirstOrderDiscountSchema,
} from "../../validation/admin/firstOrderDiscount";

const router = Router();

// CRUD
router.post("/", validate(createFirstOrderDiscountSchema), catchAsync(createFirstOrderDiscount));
router.get("/", catchAsync(getAllFirstOrderDiscounts));
router.get("/:id", catchAsync(getFirstOrderDiscountById));
router.put("/:id", validate(updateFirstOrderDiscountSchema), catchAsync(updateFirstOrderDiscount));
router.delete("/:id", catchAsync(deleteFirstOrderDiscount));

// Toggle active/inactive status
router.put("/:id/toggle-status", catchAsync(toggleFirstOrderDiscountStatus));

// Usage history
router.get("/:id/usages", catchAsync(getFirstOrderDiscountUsages));

export default router;
