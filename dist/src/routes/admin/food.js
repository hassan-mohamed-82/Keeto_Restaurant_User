"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const catchAsync_1 = require("../../utils/catchAsync");
const hasPermission_1 = require("../../middlewares/hasPermission");
const validation_1 = require("../../middlewares/validation");
const food_1 = require("../../validation/admin/food");
const food_2 = require("../../controllers/admin/food");
const foodIngredients_1 = require("../../controllers/admin/foodIngredients");
const router = (0, express_1.Router)();
// ✅ Select data - يحتاج صلاحية read فقط
router.get("/select", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(food_2.getFoodSelectData));
// ✅ Create food - يحتاج صلاحية create
router.post("/", (0, hasPermission_1.hasPermission)("food", "create"), (0, catchAsync_1.catchAsync)(food_2.createFood));
// ✅ Bulk apply discount to food items (by foodIds, subcategoryIds, categoryIds, or all foods when empty)
router.put("/discount", (0, hasPermission_1.hasPermission)("food", "update"), (0, validation_1.validate)(food_1.bulkApplyFoodDiscountSchema), (0, catchAsync_1.catchAsync)(food_2.bulkApplyFoodDiscount));
// ✅ Get all foods - يحتاج صلاحية read
router.get("/", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(food_2.getAllFoods));
// ✅ Get out-of-stock foods - restaurant sees all OOS foods + unavailable branches; branch sees only its own OOS
router.get("/out-of-stock", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(food_2.getOutOfStockFoods));
// ✅ Get active and in-stock foods with variations and addons for ordering / weighing
router.get("/available", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(food_2.getActiveInStockFoods));
// ✅ Get food by id - يحتاج صلاحية read
router.get("/:id", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(food_2.getFoodById));
// ✅ Update food - يحتاج صلاحية update
router.put("/:id", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.updateFood));
// ✅ Delete food - يحتاج صلاحية delete
router.delete("/:id", (0, hasPermission_1.hasPermission)("food", "delete"), (0, catchAsync_1.catchAsync)(food_2.deleteFood));
// Restore a soft-deleted food
router.put("/:id/restore", (0, hasPermission_1.hasPermission)("food", "delete"), (0, catchAsync_1.catchAsync)(food_2.restoreFoodById));
// ✅ Assign ingredients - يحتاج صلاحية update
router.post("/assign-ingredients/:id", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(foodIngredients_1.assignIngredientsToFood));
// ✅ Get recipe - يحتاج صلاحية read
router.get("/recipe/:id", (0, hasPermission_1.hasPermission)("food", "read"), (0, catchAsync_1.catchAsync)(foodIngredients_1.getFoodRecipe));
// ✅ Toggle variation status - يحتاج صلاحية update
router.put("/variation/:id/status", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.toggleVariationStatus));
// ✅ Toggle option status - يحتاج صلاحية update
router.put("/option/:id/status", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.toggleVariationOptionStatus));
// ✅ Change food status (global) - يحتاج صلاحية update
router.put("/status/:id", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.changeFoodStatus));
// ✅ Change food status for a specific branch
router.put("/:id/branch/:branchId/status", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.changeFoodStatus));
// ✅ Toggle food out-of-stock (global, with optional branchId for subcategory cascade)
router.put("/:id/branch/:branchId/out-of-stock", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.toggleFoodOutOfStock));
// ✅ Change food order level
router.put("/:id/order-level", (0, hasPermission_1.hasPermission)("food", "update"), (0, catchAsync_1.catchAsync)(food_2.changeFoodOrderLevel));
exports.default = router;
