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
import { hasPermission } from "../../middlewares/hasPermission";
import {
    createFirstOrderDiscountSchema,
    updateFirstOrderDiscountSchema,
} from "../../validation/admin/firstOrderDiscount";

const router = Router();

// CRUD
router.post("/", hasPermission("firstorderdiscount", "create"), validate(createFirstOrderDiscountSchema), catchAsync(createFirstOrderDiscount));
router.get("/", hasPermission("firstorderdiscount", "read"), catchAsync(getAllFirstOrderDiscounts));
router.get("/:id", hasPermission("firstorderdiscount", "read"), catchAsync(getFirstOrderDiscountById));
router.put("/:id", hasPermission("firstorderdiscount", "update"), validate(updateFirstOrderDiscountSchema), catchAsync(updateFirstOrderDiscount));
router.delete("/:id", hasPermission("firstorderdiscount", "delete"), catchAsync(deleteFirstOrderDiscount));

// Toggle active/inactive status
router.put("/:id/toggle-status", hasPermission("firstorderdiscount", "update"), catchAsync(toggleFirstOrderDiscountStatus));

// Usage history
router.get("/:id/usages", hasPermission("firstorderdiscount", "read"), catchAsync(getFirstOrderDiscountUsages));

export default router;
