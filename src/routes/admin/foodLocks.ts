import { Router } from "express";
import {
    getBranchAvailability,
    toggleBranchFoodLock,
    toggleIngredientLock,
} from "../../controllers/admin/foodLocks";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";

const router = Router();

// جلب حالة قفل منتج أو مكون في جميع الفروع
router.get("/availability", hasPermission("foods", "read"), catchAsync(getBranchAvailability));

// قفل منتج في فرع معين
router.put("/:branchId/food/:foodId/lock", hasPermission("foods", "update"), catchAsync(toggleBranchFoodLock));

// قفل ingredient لمنتج (سواء globally أو في فرع معين عبر تمرير branchId في الـ body)
router.put("/food/:foodId/ingredient/:ingredientId/lock", hasPermission("foods", "update"), catchAsync(toggleIngredientLock));

export default router;
