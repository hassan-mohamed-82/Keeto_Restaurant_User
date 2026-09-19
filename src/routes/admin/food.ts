import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    createFood,
    getAllFoods,
    getFoodById,
    updateFood,
    deleteFood,
    getFoodSelectData,
    toggleVariationStatus,
    toggleVariationOptionStatus,
    changeFoodStatus,
    getOutOfStockFoods,
    toggleFoodOutOfStock,
} from "../../controllers/admin/food";
import {
    assignIngredientsToFood,
    getFoodRecipe,
} from "../../controllers/admin/foodIngredients";

const router = Router();

// ✅ Select data - يحتاج صلاحية read فقط
router.get("/select", hasPermission("food", "read"), catchAsync(getFoodSelectData));

// ✅ Create food - يحتاج صلاحية create
router.post("/", hasPermission("food", "create"), catchAsync(createFood));

// ✅ Get all foods - يحتاج صلاحية read
router.get("/", hasPermission("food", "read"), catchAsync(getAllFoods));

// ✅ Get out-of-stock foods - restaurant sees all OOS foods + unavailable branches; branch sees only its own OOS
router.get("/out-of-stock", hasPermission("food", "read"), catchAsync(getOutOfStockFoods));

// ✅ Get food by id - يحتاج صلاحية read
router.get("/:id", hasPermission("food", "read"), catchAsync(getFoodById));

// ✅ Update food - يحتاج صلاحية update
router.put("/:id", hasPermission("food", "update"), catchAsync(updateFood));

// ✅ Delete food - يحتاج صلاحية delete
router.delete("/:id", hasPermission("food", "delete"), catchAsync(deleteFood));

// ✅ Assign ingredients - يحتاج صلاحية update
router.post("/assign-ingredients/:id", hasPermission("food", "update"), catchAsync(assignIngredientsToFood));

// ✅ Get recipe - يحتاج صلاحية read
router.get("/recipe/:id", hasPermission("food", "read"), catchAsync(getFoodRecipe));

// ✅ Toggle variation status - يحتاج صلاحية update
router.put("/variation/:id/status", hasPermission("food", "update"), catchAsync(toggleVariationStatus));

// ✅ Toggle option status - يحتاج صلاحية update
router.put("/option/:id/status", hasPermission("food", "update"), catchAsync(toggleVariationOptionStatus));

// ✅ Change food status (global) - يحتاج صلاحية update
router.put("/status/:id", hasPermission("food", "update"), catchAsync(changeFoodStatus));
// ✅ Change food status for a specific branch
router.put("/:id/branch/:branchId/status", hasPermission("food", "update"), catchAsync(changeFoodStatus));
// ✅ Toggle food out-of-stock (global, with optional branchId for subcategory cascade)
router.put("/:id/branch/:branchId/out-of-stock", hasPermission("food", "update"), catchAsync(toggleFoodOutOfStock));

export default router;
