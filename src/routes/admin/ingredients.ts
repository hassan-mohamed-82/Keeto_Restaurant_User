import { catchAsync } from "../../utils/catchAsync";
import { Router } from "express";
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

router.get("/select", catchAsync(getallactiveingredientscategory));
router.post("/", catchAsync(createIngredient));
router.get("/", catchAsync(getIngredients));
router.get("/:id", catchAsync(getIngredientById));
router.get("/foods/:id", catchAsync(getFoodsByIngredient));
router.put("/:id", catchAsync(updateIngredient));
router.put("/stock/:id", catchAsync(toggleIngredientStock));
router.delete("/:id", catchAsync(deleteIngredient));

export default router;