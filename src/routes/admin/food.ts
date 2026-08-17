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
} from "../../controllers/admin/food";
import {
    assignIngredientsToFood,
    getFoodRecipe,
} from "../../controllers/admin/foodIngredients";

const router = Router();

// ✅ Select data - يحتاج صلاحية read فقط
router.get("/select", hasPermission("foods", "read"), catchAsync(getFoodSelectData));

// ✅ Create food - يحتاج صلاحية create
router.post("/", hasPermission("foods", "create"), catchAsync(createFood));

// ✅ Get all foods - يحتاج صلاحية read
router.get("/", hasPermission("foods", "read"), catchAsync(getAllFoods));

// ✅ Get out-of-stock foods - restaurant sees all OOS foods + unavailable branches; branch sees only its own OOS
router.get("/out-of-stock", hasPermission("foods", "read"), catchAsync(getOutOfStockFoods));

// ✅ Get food by id - يحتاج صلاحية read
router.get("/:id", hasPermission("foods", "read"), catchAsync(getFoodById));

// ✅ Update food - يحتاج صلاحية update
router.put("/:id", hasPermission("foods", "update"), catchAsync(updateFood));

// ✅ Delete food - يحتاج صلاحية delete
router.delete("/:id", hasPermission("foods", "delete"), catchAsync(deleteFood));

// ✅ Assign ingredients - يحتاج صلاحية update
router.post("/assign-ingredients/:id", hasPermission("foods", "update"), catchAsync(assignIngredientsToFood));

// ✅ Get recipe - يحتاج صلاحية read
router.get("/recipe/:id", hasPermission("foods", "read"), catchAsync(getFoodRecipe));

// ✅ Toggle variation status - يحتاج صلاحية update
router.put("/variation/:id/status", hasPermission("foods", "update"), catchAsync(toggleVariationStatus));

// ✅ Toggle option status - يحتاج صلاحية update
router.put("/option/:id/status", hasPermission("foods", "update"), catchAsync(toggleVariationOptionStatus));

// ✅ Change food status - يحتاج صلاحية update
router.put("/status/:id", hasPermission("foods", "update"), catchAsync(changeFoodStatus));

export default router;
