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
router.get("/select", hasPermission("food", "read"), catchAsync(getallactiveingredientscategory));

// ✅ Create ingredient - يحتاج صلاحية create (foods module)
router.post("/", hasPermission("food", "create"), catchAsync(createIngredient));

// ✅ Get all ingredients - يحتاج صلاحية read (foods module)
router.get("/", hasPermission("food", "read"), catchAsync(getIngredients));

// ✅ Get ingredient by id - يحتاج صلاحية read (foods module)
router.get("/:id", hasPermission("food", "read"), catchAsync(getIngredientById));

// ✅ Get foods by ingredient - يحتاج صلاحية read (foods module)
router.get("/foods/:id", hasPermission("food", "read"), catchAsync(getFoodsByIngredient));

// ✅ Update ingredient - يحتاج صلاحية update (foods module)
router.put("/:id", hasPermission("food", "update"), catchAsync(updateIngredient));

// ✅ Toggle stock - يحتاج صلاحية update (foods module)
router.put("/stock/:id", hasPermission("food", "update"), catchAsync(toggleIngredientStock));

// ✅ Delete ingredient - يحتاج صلاحية delete (foods module)
router.delete("/:id", hasPermission("food", "delete"), catchAsync(deleteIngredient));

export default router;