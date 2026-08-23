import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    assignRecommendedProducts,
    getRecommendedProductsByFoodId,
    removeRecommendedProduct,
    getFoodsForSelect,
    getAllRecommendedFoods,
} from "../../controllers/admin/recommendedFood";

const router = Router();

// ✅ Get all foods for select dropdown (returns id, name, nameAr, nameFr, image, price)
router.get("/foods-select", hasPermission("foods", "read"), catchAsync(getFoodsForSelect));

// ✅ Get all recommended foods pairings (includes basic food and its list of recommended foods)
router.get("/", hasPermission("foods", "read"), catchAsync(getAllRecommendedFoods));

// ✅ Assign / update recommended products for a basic food item
router.post("/assign", hasPermission("foods", "update"), catchAsync(assignRecommendedProducts));

// ✅ Get recommended products for a specific basic food item
router.get("/:foodId", hasPermission("foods", "read"), catchAsync(getRecommendedProductsByFoodId));

// ✅ Remove a recommended product link
router.delete("/:foodId/:recommendedFoodId", hasPermission("foods", "delete"), catchAsync(removeRecommendedProduct));

export default router;
