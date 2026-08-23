import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    assignRecommendedProducts,
    getRecommendedProductsByFoodId,
    removeRecommendedProduct,
} from "../../controllers/admin/recommendedFood";

const router = Router();

// ✅ Assign/update recommended products for a basic food item
router.post("/assign", hasPermission("foods", "update"), catchAsync(assignRecommendedProducts));

// ✅ Get recommended products for a basic food item
router.get("/:foodId", hasPermission("foods", "read"), catchAsync(getRecommendedProductsByFoodId));

// ✅ Remove a recommended product link
router.delete("/:foodId/:recommendedFoodId", hasPermission("foods", "delete"), catchAsync(removeRecommendedProduct));

export default router;
