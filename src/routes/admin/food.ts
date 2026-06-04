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
    assignIngredientsToFood,
    getFoodRecipe,
    toggleVariationStatus,
    toggleVariationOptionStatus,
    changeFoodStatus
} from "../../controllers/admin/food";
import { authorizeRoles } from "../../middlewares/authorized";

const router = Router();

// ✅ Select data - يحتاج صلاحية read فقط
router.get("/select",authorizeRoles("branch_manager","staff"), hasPermission("foods", "read"), catchAsync(getFoodSelectData));

// ✅ Create food - يحتاج صلاحية create
router.post("/", authorizeRoles("branch_manager","staff"),hasPermission("foods", "create"), catchAsync(createFood));

// ✅ Get all foods - يحتاج صلاحية read
router.get("/",authorizeRoles("branch_manager","staff"), hasPermission("foods", "read"), catchAsync(getAllFoods));

// ✅ Get food by id - يحتاج صلاحية read
router.get("/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "read"), catchAsync(getFoodById));

// ✅ Update food - يحتاج صلاحية update
router.put("/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "update"), catchAsync(updateFood));

// ✅ Delete food - يحتاج صلاحية delete
router.delete("/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "delete"), catchAsync(deleteFood));

// ✅ Assign ingredients - يحتاج صلاحية update
router.post("/assign-ingredients/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "update"), catchAsync(assignIngredientsToFood));

// ✅ Get recipe - يحتاج صلاحية read
router.get("/recipe/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "read"), catchAsync(getFoodRecipe));

// ✅ Toggle variation status - يحتاج صلاحية update
router.put("/variation/:id/status",authorizeRoles("branch_manager","staff"), hasPermission("foods", "update"), catchAsync(toggleVariationStatus));

// ✅ Toggle option status - يحتاج صلاحية update
router.put("/option/:id/status",authorizeRoles("branch_manager","staff"), hasPermission("foods", "update"), catchAsync(toggleVariationOptionStatus));

// ✅ Change food status - يحتاج صلاحية update
router.put("/status/:id",authorizeRoles("branch_manager","staff"), hasPermission("foods", "update"), catchAsync(changeFoodStatus));

export default router;
