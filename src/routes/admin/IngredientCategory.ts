import { Router } from "express";
import { createIngredientCategory, deleteIngredientCategory, getIngredientCategories, getIngredientCategoryById, updateIngredientCategory } from "../../controllers/admin/IngredientCategory";
import { catchAsync } from "../../utils/catchAsync";
const router = Router();


// -------------------------------------------
// 🥦 CRUD For Ingredient Categories (فئات المكونات)
// -------------------------------------------

// 🟢 Create a new Category
// POST /api/admin/categories
router.post("/", catchAsync(createIngredientCategory));

// 🔴 Get All Categories
// GET /api/admin/categories
router.get("/", catchAsync(getIngredientCategories));

// 🔵 Get Category by ID
// GET /api/admin/categories/:id
router.get("/:id", catchAsync(getIngredientCategoryById));

// 🟡 Update a Category
// PUT /api/admin/categories/:id
router.put("/:id", catchAsync(updateIngredientCategory));

// 🟣 Delete a Category
// DELETE /api/admin/categories/:id
router.delete("/:id", deleteIngredientCategory);


export default router;