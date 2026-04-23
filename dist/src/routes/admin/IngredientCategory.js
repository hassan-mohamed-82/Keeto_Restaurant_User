"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const IngredientCategory_1 = require("../../controllers/admin/IngredientCategory");
const catchAsync_1 = require("../../utils/catchAsync");
const router = (0, express_1.Router)();
// -------------------------------------------
// 🥦 CRUD For Ingredient Categories (فئات المكونات)
// -------------------------------------------
// 🟢 Create a new Category
// POST /api/admin/categories
router.post("/", (0, catchAsync_1.catchAsync)(IngredientCategory_1.createIngredientCategory));
// 🔴 Get All Categories
// GET /api/admin/categories
router.get("/", (0, catchAsync_1.catchAsync)(IngredientCategory_1.getIngredientCategories));
// 🔵 Get Category by ID
// GET /api/admin/categories/:id
router.get("/:id", (0, catchAsync_1.catchAsync)(IngredientCategory_1.getIngredientCategoryById));
// 🟡 Update a Category
// PUT /api/admin/categories/:id
router.put("/:id", (0, catchAsync_1.catchAsync)(IngredientCategory_1.updateIngredientCategory));
// 🟣 Delete a Category
// DELETE /api/admin/categories/:id
router.delete("/:id", IngredientCategory_1.deleteIngredientCategory);
exports.default = router;
