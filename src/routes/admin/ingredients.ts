import { catchAsync } from "../../utils/catchAsync";
import { Router } from "express";
import { hasPermission } from "../../middlewares/hasPermission";
import {
    getIngredientById,
    getIngredients,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    toggleIngredientStock,
    getallactiveingredientscategory,
    getFoodsByIngredient
} from "../../controllers/admin/ingredients"
const router = Router();

// ✅ Get select data - يحتاج صلاحية read (foods module)
router.get("/select", hasPermission("foods", "read"), catchAsync(getallactiveingredientscategory));

// ✅ Create ingredient - يحتاج صلاحية create (foods module)
router.post("/", hasPermission("foods", "create"), catchAsync(createIngredient));

// ✅ Get all ingredients - يحتاج صلاحية read (foods module)
router.get("/", hasPermission("foods", "read"), catchAsync(getIngredients));

// ✅ Get ingredient by id - يحتاج صلاحية read (foods module)
router.get("/:id", hasPermission("foods", "read"), catchAsync(getIngredientById));

// ✅ Get foods by ingredient - يحتاج صلاحية read (foods module)
router.get("/foods/:id", hasPermission("foods", "read"), catchAsync(getFoodsByIngredient));

// ✅ Update ingredient - يحتاج صلاحية update (foods module)
router.put("/:id", hasPermission("foods", "update"), catchAsync(updateIngredient));

// ✅ Toggle stock - يحتاج صلاحية update (foods module)
router.put("/stock/:id", hasPermission("foods", "update"), catchAsync(toggleIngredientStock));

// ✅ Delete ingredient - يحتاج صلاحية delete (foods module)
router.delete("/:id", hasPermission("foods", "delete"), catchAsync(deleteIngredient));

export default router;