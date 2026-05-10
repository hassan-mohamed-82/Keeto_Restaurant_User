import { Router } from "express";
import { catchAsync } from "../../utils/catchAsync";
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
    toggleVariationOptionStatus
} from "../../controllers/admin/food";

const router = Router();

router.get("/select", catchAsync(getFoodSelectData));
router.post("/", catchAsync(createFood));
router.get("/", catchAsync(getAllFoods));
router.get("/:id", catchAsync(getFoodById));
router.put("/:id", catchAsync(updateFood));
router.delete("/:id", catchAsync(deleteFood));
router.post("/assign-ingredients/:id", catchAsync(assignIngredientsToFood));
router.get("/recipe/:id", catchAsync(getFoodRecipe));
router.put("/variation/:id/status", catchAsync(toggleVariationStatus));
router.put("/option/:id/status", catchAsync(toggleVariationOptionStatus));

export default router;
